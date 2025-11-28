import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import type { PagesFunction } from '@cloudflare/workers-types';

export type Env = {
  DB: D1Database;
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

const app = new Hono<{ Bindings: Env }>();
app.use('*', cors());

const nowMs = () => Date.now();
const uuid = () => crypto.randomUUID();

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
    await db
      .prepare('DELETE FROM chat_palettes WHERE participant_id IN (SELECT id FROM participants WHERE session_id = ?)')
      .bind(id)
      .run();
    await db.prepare('DELETE FROM participants WHERE session_id = ?').bind(id).run();
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

async function rollCC(rng: () => Promise<number>, bonus: number, target: number) {
  const tens: number[] = [];
  for (let i = 0; i < Math.abs(bonus) + 2; i++) {
    tens.push(Math.floor((await rng()) * 10));
  }
  const one = tens[tens.length - 1];
  const dice = tens.map((t) => t * 10 + one).map((d) => (d === 0 ? 100 : d));
  const value = bonus < 0 ? Math.max(...dice) : Math.min(...dice);
  const success = value <= target;
  return { value, success, target, dice };
}

async function rollDie(rng: () => Promise<number>, faces: number) {
  const results: number[] = [];
  for (let i = 0; i < 1; i++) {
    results.push(Math.floor((await rng()) * faces) + 1);
  }
  return results;
}

async function getRng(db: D1Database, sessionId: string, mode: string, manualTime?: number, offset?: number) {
  if (mode === 'quantum') {
    return async () => {
      const q = await nextQuantumNumber(db, sessionId);
      if (q !== null) return (q % 100) / 100;
      const fallback = crypto.getRandomValues(new Uint32Array(1))[0] % 100;
      return fallback / 100;
    };
  }
  const baseSeed = Math.floor(((manualTime ?? nowMs()) + (offset ?? 0)) / 1000);
  const rng = new RubyRandom(baseSeed);
  return async () => rng.rand(100) / 100;
}

async function handleMessage(db: D1Database, sessionId: string, participantId: string | null, raw: string) {
  const session = await db
    .prepare('SELECT mode, manual_time, current_time_offset FROM sessions WHERE id = ?')
    .bind(sessionId)
    .first<Record<string, unknown>>();
  if (!session) throw new Error('Session not found');
  const mode = String(session.mode);
  const manualTime = session.manual_time as number | null;
  const offset = session.current_time_offset as number | null;
  const rng = await getRng(db, sessionId, mode, manualTime ?? undefined, offset ?? undefined);
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
    .prepare('INSERT INTO chat_messages (id, session_id, participant_id, raw_text, rendered_text, result_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, sessionId, participantId, raw, rendered, result ? JSON.stringify(result) : null, ts)
    .run();
  return { id, rendered_text: rendered, created_at: ts, raw_text: raw };
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

app.post('/api/login/google', zValidator('json', loginSchema), async (c) => {
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

app.post('/api/sessions', async (c) => {
  const { ownerEmail, ownerName } = await c.req.json();
  if (!ownerEmail || !ownerName) return c.json({ error: 'Missing owner info' }, 400);
  const user = await ensureUser(c.env.DB, ownerEmail, ownerName);
  await removeOldSessions(c.env.DB, user.id);
  const sessionId = uuid();
  const password = crypto.randomUUID().slice(0, 8);
  const ts = nowMs();
  await c.env.DB
    .prepare('INSERT INTO sessions (id, owner_id, password, created_at, last_updated, mode) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(sessionId, user.id, password, ts, ts, 'system')
    .run();
  await c.env.DB
    .prepare('INSERT INTO session_tokens (id, session_id, password, created_at) VALUES (?, ?, ?, ?)')
    .bind(uuid(), sessionId, password, ts)
    .run();
  const quantum = (await fetchQuantumNumbers()) ?? fallbackCryptoNumbers();
  await storeQuantumBatch(c.env.DB, sessionId, quantum);
  return c.json({ sessionId, password });
});

app.post('/api/sessions/:id/join', async (c) => {
  const sessionId = c.req.param('id');
  const { name } = await c.req.json();
  const session = await c.env.DB.prepare('SELECT id FROM sessions WHERE id = ?').bind(sessionId).first();
  if (!session) return c.json({ error: 'Session not found' }, 404);
  const ts = nowMs();
  const pid = uuid();
  await c.env.DB
    .prepare('INSERT INTO participants (id, session_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(pid, sessionId, name ?? 'Guest', ts)
    .run();
  return c.json({ participantId: pid });
});

app.post('/api/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const { participantId, text } = await c.req.json();
  if (!text) return c.json({ error: 'Missing text' }, 400);
  const message = await handleMessage(c.env.DB, sessionId, participantId ?? null, text);
  return c.json({ message });
});

app.get('/api/sessions/:id/messages', async (c) => {
  const sessionId = c.req.param('id');
  const rows = await c.env.DB.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at ASC').bind(sessionId).all();
  return c.json({ messages: rows.results ?? [] });
});

app.post('/api/sessions/:id/palettes', async (c) => {
  const sessionId = c.req.param('id');
  const { participantId, items } = await c.req.json();
  if (!participantId || !Array.isArray(items)) return c.json({ error: 'Invalid payload' }, 400);
  await c.env.DB.prepare('DELETE FROM chat_palettes WHERE participant_id = ?').bind(participantId).run();
  const ts = nowMs();
  for (const item of items) {
    await c.env.DB
      .prepare('INSERT INTO chat_palettes (id, participant_id, label, content, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(uuid(), participantId, item.label, item.content, ts)
      .run();
  }
  return c.json({ ok: true });
});

app.get('/api/sessions/:id/palettes/:participantId', async (c) => {
  const { participantId } = c.req.param();
  const rows = await c.env.DB.prepare('SELECT * FROM chat_palettes WHERE participant_id = ?').bind(participantId).all();
  return c.json({ items: rows.results ?? [] });
});

app.post('/api/sessions/:id/kp', async (c) => {
  const sessionId = c.req.param('id');
  const { password, mode, manualTime, offset, confirmQuantum } = await c.req.json();
  const session = await c.env.DB.prepare('SELECT password FROM sessions WHERE id = ?').bind(sessionId).first<{ password: string }>();
  if (!session) return c.json({ error: 'Session not found' }, 404);
  if (session.password !== password) return c.json({ error: 'Forbidden' }, 403);
  if (mode === 'quantum' && !confirmQuantum) {
    return c.json({ error: 'Quantum mode requires confirmation' }, 400);
  }
  await c.env.DB
    .prepare('UPDATE sessions SET mode = ?, manual_time = ?, current_time_offset = ? WHERE id = ?')
    .bind(mode ?? 'system', manualTime ?? null, offset ?? 0, sessionId)
    .run();
  return c.json({ ok: true });
});

app.get('/api/sessions/:id/logs', async (c) => {
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

export const onRequest: PagesFunction<Env> = async (context) => app.fetch(context.request, context.env, context);
export { app };
