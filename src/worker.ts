import { Hono } from 'hono';
import type { Context } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { DiceRoom } from './durable_objects/DiceRoom';

type Env = {
  DB: D1Database;
  DICE_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
};

const Q_RANDOM_ENDPOINT = 'https://qrandom.io/api/integers?length=512&min=1&max=100';

class RubyRandom {
  private static readonly N = 624;
  private static readonly M = 397;
  private static readonly MATRIX_A = 0x9908b0df;
  private static readonly UPPER_MASK = 0x80000000;
  private static readonly LOWER_MASK = 0x7fffffff;
  private mt: number[] = new Array(RubyRandom.N).fill(0);
  private mti = RubyRandom.N + 1;

  constructor(seed: number) {
    this.initGenRand(seed);
  }

  private initGenRand(s: number) {
    this.mt[0] = s >>> 0;
    for (let i = 1; i < RubyRandom.N; i++) {
      const prev = this.mt[i - 1];
      this.mt[i] = (1812433253 * (prev ^ (prev >>> 30)) + i) >>> 0;
    }
    this.mti = RubyRandom.N;
  }

  private genRandInt32(): number {
    if (this.mti >= RubyRandom.N) {
      for (let k = 0; k < RubyRandom.N; k++) {
        const y = (this.mt[k] & RubyRandom.UPPER_MASK) | (this.mt[(k + 1) % RubyRandom.N] & RubyRandom.LOWER_MASK);
        this.mt[k] = this.mt[(k + RubyRandom.M) % RubyRandom.N] ^ (y >>> 1) ^ ((y & 1) ? RubyRandom.MATRIX_A : 0);
      }
      this.mti = 0;
    }

    let y = this.mt[this.mti];
    this.mti += 1;

    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  random(): number {
    const a = this.genRandInt32() >>> 5;
    const b = this.genRandInt32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992.0;
  }

  private makeMask(limit: number): number {
    return (1 << limit.toString(2).length) - 1;
  }

  private limitedRand(limit: number): number {
    const mask = this.makeMask(limit);
    const chunks = Math.ceil(mask.toString(2).length / 32);
    while (true) {
      let v = 0;
      for (let i = 0; i < chunks; i++) {
        v |= this.genRandInt32() << 32 * i;
      }
      v &= mask;
      if (v <= limit) {
        return v;
      }
    }
  }

  rand(n?: number): number {
    if (n === undefined) return this.random();
    if (typeof n === 'number' && n > 0) {
      return this.limitedRand(n - 1);
    }
    return 0;
  }
}

const nowMs = () => Date.now();
const uuid = () => crypto.randomUUID();

const app = new Hono<{ Bindings: Env }>();
const api = new Hono<{ Bindings: Env }>();

api.use('*', cors());

function forwardToRoom(c: Context<{ Bindings: Env }>) {
  const roomId = c.req.param('roomId');
  const id = c.env.DICE_ROOM.idFromName(roomId);
  const stub = c.env.DICE_ROOM.get(id);
  const url = new URL(c.req.url);
  const replacedPath = url.pathname.replace(/^\/api\/rooms\/[^/]+/, '');
  url.pathname = replacedPath.length ? replacedPath : '/';
  const request = new Request(url.toString(), c.req.raw);
  return stub.fetch(request);
}

api.all('/rooms/:roomId/websocket', (c) => forwardToRoom(c));
api.all('/rooms/:roomId/*', (c) => forwardToRoom(c));
api.all('/rooms/:roomId', (c) => forwardToRoom(c));

type SessionState = {
  mode: string;
  game_time_elapsed: number;
  last_resumed_at: number | null;
};

function normalizeSessionState(row: Record<string, unknown>): SessionState {
  return {
    mode: String(row.mode ?? 'system'),
    game_time_elapsed: Number(row.game_time_elapsed ?? 0),
    last_resumed_at: row.last_resumed_at === null || row.last_resumed_at === undefined ? null : Number(row.last_resumed_at)
  };
}

function computeGameTime(state: SessionState, reference = nowMs()) {
  if (state.last_resumed_at === null) return state.game_time_elapsed;
  return state.game_time_elapsed + (reference - state.last_resumed_at);
}

async function fetchQuantumNumbers(): Promise<number[] | null> {
  try {
    const res = await fetch(Q_RANDOM_ENDPOINT);
    if (!res.ok) return null;
    const json = await res.json();
    if (Array.isArray(json?.data)) {
      const numbers: number[] = json.data
        .map((v: unknown) => (typeof v === 'number' ? Math.abs(Math.floor(v)) : null))
        .filter((v: number | null): v is number => v !== null)
        .slice(0, 512);
      if (numbers.length >= 512) return numbers;
    }
    return null;
  } catch (err) {
    console.error('Quantum fetch failed', err);
    return null;
  }
}

function fallbackCryptoNumbers(count = 512): number[] {
  return Array.from({ length: count }, () => crypto.getRandomValues(new Uint32Array(1))[0] % 100 + 1);
}

async function ensureUser(db: D1Database, email: string, name: string) {
  const existing = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first<Record<string, unknown>>();
  if (existing) return existing;
  const id = uuid();
  const ts = nowMs();
  await db.prepare('INSERT INTO users (id, email, name, created_at) VALUES (?, ?, ?, ?)').bind(id, email, name, ts).run();
  return { id, email, name, created_at: ts };
}

async function removeOldSessions(db: D1Database, ownerId: string) {
  const rows = await db.prepare('SELECT id FROM sessions WHERE owner_id = ? ORDER BY created_at ASC').bind(ownerId).all();
  const ids: string[] = rows.results?.map((r: { id: string }) => r.id) ?? [];
  if (ids.length < 10) return;
  const toRemove = ids.slice(0, ids.length - 9);
  for (const id of toRemove) {
    await db.prepare('DELETE FROM chat_messages WHERE session_id = ?').bind(id).run();
    await db.prepare('DELETE FROM quantum_numbers WHERE session_id = ?').bind(id).run();
    await db.prepare('DELETE FROM session_tokens WHERE session_id = ?').bind(id).run();
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
  }
}

async function storeQuantumBatch(db: D1Database, sessionId: string, numbers: number[]) {
  const ts = nowMs();
  for (const num of numbers) {
    await db.prepare('INSERT INTO quantum_numbers (session_id, value, consumed) VALUES (?, ?, 0)').bind(sessionId, num).run();
  }
  await db.prepare('UPDATE sessions SET last_updated = ? WHERE id = ?').bind(ts, sessionId).run();
}

async function nextQuantumNumber(db: D1Database, sessionId: string): Promise<number | null> {
  const res = await db
    .prepare(
      'UPDATE quantum_numbers SET consumed = 1 WHERE id = (SELECT id FROM quantum_numbers WHERE session_id = ? AND consumed = 0 ORDER BY id ASC LIMIT 1) RETURNING value'
    )
    .bind(sessionId)
    .first<Record<string, unknown>>();
  if (!res || res.value === undefined || res.value === null) return null;
  return Number(res.value);
}

async function getSessionState(db: D1Database, sessionId: string): Promise<SessionState | null> {
  const row = await db
    .prepare('SELECT mode, game_time_elapsed, last_resumed_at FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  return normalizeSessionState(row);
}

async function pauseSession(db: D1Database, sessionId: string, now = nowMs()) {
  const state = await getSessionState(db, sessionId);
  if (!state) throw new Error('Session not found');
  if (state.last_resumed_at === null) return state;
  const updatedElapsed = state.game_time_elapsed + (now - state.last_resumed_at);
  await db
    .prepare('UPDATE sessions SET game_time_elapsed = ?, last_resumed_at = NULL, last_updated = ? WHERE id = ?')
    .bind(updatedElapsed, now, sessionId)
    .run();
  return { ...state, game_time_elapsed: updatedElapsed, last_resumed_at: null } satisfies SessionState;
}

async function resumeSession(db: D1Database, sessionId: string, now = nowMs()) {
  const state = await getSessionState(db, sessionId);
  if (!state) throw new Error('Session not found');
  if (state.last_resumed_at !== null) return state;
  await db
    .prepare('UPDATE sessions SET last_resumed_at = ?, last_updated = ? WHERE id = ?')
    .bind(now, now, sessionId)
    .run();
  return { ...state, last_resumed_at: now } satisfies SessionState;
}

async function setGameTime(db: D1Database, sessionId: string, gameTime: number, now = nowMs()) {
  const state = await getSessionState(db, sessionId);
  if (!state) throw new Error('Session not found');
  await db
    .prepare('UPDATE sessions SET game_time_elapsed = ?, last_resumed_at = NULL, last_updated = ? WHERE id = ?')
    .bind(gameTime, now, sessionId)
    .run();
  return { ...state, game_time_elapsed: gameTime, last_resumed_at: null } satisfies SessionState;
}

function parseDiceCommand(text: string) {
  const trimmed = text.trim();
  const ccMatch = /^CC\s*([+-]?\d+)?\s*<=\s*(\d+)/i.exec(trimmed);
  if (ccMatch) {
    const bonus = parseInt(ccMatch[1] ?? '0', 10) || 0;
    const target = parseInt(ccMatch[2], 10);
    return { type: 'cc', bonus, target } as const;
  }
  const oneMatch = /^1d(\d+)/i.exec(trimmed);
  if (oneMatch) {
    const faces = parseInt(oneMatch[1], 10);
    return { type: 'die', faces } as const;
  }
  return { type: 'chat' as const };
}

function ccResultLevel(value: number, target: number) {
  if (value === 1) return 'critical';
  const fumble = target < 50 ? value >= 96 : value === 100;
  if (fumble) return 'fumble';
  if (value <= Math.floor(target / 5)) return 'extreme';
  if (value <= Math.floor(target / 2)) return 'hard';
  if (value <= target) return 'regular';
  return 'failure';
}

async function rollCC(rng: () => Promise<number>, bonus: number, target: number) {
  const tens: number[] = [];
  for (let i = 0; i < Math.abs(bonus) + 2; i++) {
    tens.push(Math.floor((await rng()) * 10));
  }
  const one = tens[tens.length - 1];
  const dice = tens.map((t) => t * 10 + one).map((d) => (d === 0 ? 100 : d));
  const value = bonus < 0 ? Math.max(...dice) : Math.min(...dice);
  const result_level = ccResultLevel(value, target);
  const success = ['critical', 'extreme', 'hard', 'regular'].includes(result_level);
  return { value, success, target, dice, result_level };
}

async function rollDie(rng: () => Promise<number>, faces: number) {
  const results: number[] = [];
  for (let i = 0; i < 1; i++) {
    results.push(Math.floor((await rng()) * faces) + 1);
  }
  return results;
}

async function getRng(db: D1Database, sessionId: string, mode: string, gameTimeMs: number) {
  if (mode === 'quantum') {
    return async () => {
      const q = await nextQuantumNumber(db, sessionId);
      if (q !== null) return (q % 100) / 100;
      const fallback = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
      return fallback / 100;
    };
  }
  const baseSeed = Math.floor(gameTimeMs / 1000);
  const rng = new RubyRandom(baseSeed);
  return async () => rng.rand(100) / 100;
}

async function handleMessage(db: D1Database, sessionId: string, speakerName: string, raw: string) {
  const session = await getSessionState(db, sessionId);
  if (!session) throw new Error('Session not found');
  const mode = session.mode;
  const gameTime = computeGameTime(session);
  const rng = await getRng(db, sessionId, mode, gameTime);
  const parsed = parseDiceCommand(raw.split(' ')[0]);
  let rendered = raw;
  let result: Record<string, unknown> | null = null;
  if (parsed.type === 'cc') {
    const roll = await rollCC(rng, parsed.bonus, parsed.target);
    rendered = `CC<=${parsed.target} (${roll.value}) ${roll.success ? 'SUCCESS' : 'FAILURE'}`;
    result = roll;
  } else if (parsed.type === 'die') {
    const roll = await rollDie(rng, parsed.faces);
    rendered = `1d${parsed.faces}: ${roll.join(', ')}`;
    result = { rolls: roll };
  }
  const ts = nowMs();
  const id = uuid();
  await db
    .prepare('INSERT INTO chat_messages (id, session_id, speaker_name, raw_text, rendered_text, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, sessionId, speakerName || '名無しさん', raw, rendered, result ? JSON.stringify(result) : null, ts)
    .run();
  return { id, rendered_text: rendered, created_at: ts, raw_text: raw, speaker_name: speakerName || '名無しさん' };
}

const loginSchema = z.object({ idToken: z.string().min(1, 'idToken is required') });

type TokenInfo = {
  aud: string;
  exp: string;
  email?: string;
  name?: string;
  iss?: string;
};

async function verifyIdToken(idToken: string, clientId: string): Promise<TokenInfo> {
  const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!res.ok) {
    throw new Error('Invalid id_token');
  }
  const payload = (await res.json()) as TokenInfo;
  const expMs = Number(payload.exp) * 1000;
  const validIssuers = ['accounts.google.com', 'https://accounts.google.com'];
  if (payload.aud !== clientId) {
    throw new Error('Client ID mismatch');
  }
  if (!payload.iss || !validIssuers.includes(payload.iss)) {
    throw new Error('Issuer mismatch');
  }
  if (!expMs || expMs < Date.now()) {
    throw new Error('Token expired');
  }
  if (!payload.email) {
    throw new Error('Email missing in token');
  }
  return payload;
}

api.post('/login/google', zValidator('json', loginSchema), async (c) => {
  const { idToken } = c.req.valid('json');
  if (!c.env.GOOGLE_CLIENT_ID) {
    return c.json({ error: 'Server misconfiguration' }, 500);
  }
  try {
    const payload = await verifyIdToken(idToken, c.env.GOOGLE_CLIENT_ID);
    const name = payload.name ?? payload.email ?? 'Unknown';
    const user = await ensureUser(c.env.DB, payload.email!, name);
    return c.json({ user });
  } catch (err) {
    return c.json({ error: (err as Error).message }, 401);
  }
});

api.post('/sessions', async (c) => {
  const { ownerEmail, ownerName } = await c.req.json();
  if (!ownerEmail || !ownerName) return c.json({ error: 'Missing owner info' }, 400);
  const user = await ensureUser(c.env.DB, ownerEmail, ownerName);
  await removeOldSessions(c.env.DB, user.id);
  const sessionId = uuid();
  const password = crypto.randomUUID().slice(0, 8);
  const ts = nowMs();
  await c.env.DB
    .prepare(
      'INSERT INTO sessions (id, owner_id, password, created_at, last_updated, mode, game_time_elapsed, last_resumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .bind(sessionId, user.id, password, ts, ts, 'system', 0, ts)
    .run();
  await c.env.DB
    .prepare('INSERT INTO session_tokens (id, session_id, password, created_at) VALUES (?, ?, ?, ?)')
    .bind(uuid(), sessionId, password, ts)
    .run();
  const quantum = (await fetchQuantumNumbers()) ?? fallbackCryptoNumbers();
  await storeQuantumBatch(c.env.DB, sessionId, quantum);
  return c.json({ sessionId, password });
});

api.get('/sessions/:id/info', async (c) => {
  const sessionId = c.req.param('id');
  const session = await c.env.DB
    .prepare('SELECT password, mode, game_time_elapsed, last_resumed_at FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<Record<string, unknown>>();
  if (!session || typeof session.password !== 'string') return c.json({ error: 'Session not found' }, 404);

  const msgBuffer = new TextEncoder().encode(session.password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const state = normalizeSessionState(session);
  const gameTime = computeGameTime(state);

  return c.json({
    passwordHash: hashHex,
    state: { ...state, gameTime, running: state.last_resumed_at !== null }
  });
});

api.post('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const { speakerName, text } = await c.req.json();
  if (!text) return c.json({ error: 'Missing text' }, 400);
  const message = await handleMessage(c.env.DB, sessionId, speakerName ?? '名無しさん', text);
  return c.json({ message });
});

api.get('/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').bind(sessionId).all();
  return c.json({ messages: rows.results ?? [] });
});

api.post('/sessions/:id/kp', async (c) => {
  const sessionId = c.req.param('id');
  const { password, mode, setTime, action, confirmQuantum } = await c.req.json();
  const session = await c.env.DB
    .prepare('SELECT password FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<{ password: string }>();
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.password !== password) return c.json({ error: 'Forbidden' }, 403);
  if (mode === 'quantum' && !confirmQuantum) {
    return c.json({ error: 'Quantum mode requires confirmation' }, 400);
  }

  const now = nowMs();
  let state = await getSessionState(c.env.DB, sessionId);
  if (!state) return c.json({ error: 'Session not found' }, 404);
  const desiredMode = typeof mode === 'string' ? mode : state.mode;

  if (typeof setTime === 'number' && !Number.isNaN(setTime)) {
    state = await setGameTime(c.env.DB, sessionId, setTime, now);
  }

  if (action === 'pause') {
    state = await pauseSession(c.env.DB, sessionId, now);
  } else if (action === 'resume') {
    state = await resumeSession(c.env.DB, sessionId, now);
  }

  await c.env.DB
    .prepare('UPDATE sessions SET mode = ?, last_updated = ? WHERE id = ?')
    .bind(desiredMode ?? 'system', now, sessionId)
    .run();

  state = (await getSessionState(c.env.DB, sessionId)) ?? state;
  const gameTime = computeGameTime(state);

  return c.json({ ok: true, state: { ...state, mode: desiredMode, gameTime } });
});

api.get('/sessions/:id/logs', async (c) => {
  const sessionId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').bind(sessionId).all();
  const payload = JSON.stringify(rows.results ?? [], null, 2);
  return new Response(payload, {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="session-${sessionId}.json"`
    }
  });
});

app.route('/api', api);

const worker = {
  fetch: async (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    if (assetResponse.status !== 404) {
      return assetResponse;
    }

    const indexUrl = new URL('/index.html', url.origin);
    const indexRequest = new Request(indexUrl.toString(), { method: 'GET', headers: request.headers });
    return env.ASSETS.fetch(indexRequest);
  }
};

export default worker;
export { DiceRoom };
