import { Hono } from 'hono';
import { upgradeWebSocket } from 'hono/cloudflare';
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyResult } from 'jose';

export type DurableEnv = {
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_JWKS_URL?: string;
  GOOGLE_TOKENINFO_URL?: string;
};

export type AuthContext = {
  userId: string;
  userName: string;
};

type TimerState = {
  elapsed: number;
  startedAt: number | null;
};

type RollEvent = {
  kind: 'roll';
  id: string;
  userId: string;
  userName: string;
  sides: number;
  result: number;
  at: number;
};

type BroadcastEnvelope =
  | { type: 'state'; state: RoomSnapshot }
  | { type: 'roll'; event: RollEvent; state: RoomSnapshot }
  | { type: 'timer'; state: RoomSnapshot; stoppedAt?: number };

type RoomSnapshot = {
  roomId: string;
  timer: { running: boolean; elapsed: number; startedAt: number | null };
  lastRoll: RollEvent | null;
};

function parseJsonMessage(data: unknown): Record<string, unknown> | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (err) {
      console.warn('Invalid JSON payload', err);
      return null;
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder().decode(data));
    } catch (err) {
      console.warn('Invalid JSON buffer payload', err);
      return null;
    }
  }
  return null;
}

function rollDie(sides: number): number {
  const clampedSides = Number.isFinite(sides) && sides > 0 ? Math.floor(sides) : 6;
  const upper = Math.max(2, Math.min(clampedSides, 1000));
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return (buffer[0] % upper) + 1;
}

export class DiceRoom {
  private readonly roomId: string;
  private readonly app: Hono<{ Bindings: DurableEnv; Variables: { auth: AuthContext } }>;
  private readonly connections = new Map<string, WebSocket>();
  private readonly googleJwks = createRemoteJWKSet(
    new URL(this.env.GOOGLE_JWKS_URL || 'https://www.googleapis.com/oauth2/v3/certs')
  );
  private timer: TimerState = { elapsed: 0, startedAt: null };
  private lastRoll: RollEvent | null = null;
  private tablesReady?: Promise<void>;

  constructor(private readonly state: DurableObjectState, private readonly env: DurableEnv) {
    this.roomId = this.state.id.toString();
    this.app = new Hono();

    this.state.blockConcurrencyWhile(async () => {
      await this.ensureTables();
      const stored = await this.env.DB.prepare('SELECT state_json FROM dice_room_state WHERE room_id = ?')
        .bind(this.roomId)
        .first<{ state_json: string }>();
      if (stored?.state_json) {
        try {
          const parsed = JSON.parse(stored.state_json) as Partial<RoomSnapshot> & { timer?: TimerState };
          if (parsed.timer) {
            this.timer = {
              elapsed: Number(parsed.timer.elapsed ?? 0),
              startedAt: parsed.timer.startedAt ?? null
            };
          }
          this.lastRoll = (parsed.lastRoll as RollEvent | null) ?? null;
        } catch (err) {
          console.warn('Failed to restore durable state', err);
        }
      }
    });

    this.app.use('*', async (c, next) => {
      const url = new URL(c.req.url);
      const tokenFromQuery = url.searchParams.get('idToken');
      const tokenFromProtocol = c.req.header('sec-websocket-protocol');
      const tokenFromAuth = c.req.header('authorization');
      const token = tokenFromQuery ?? tokenFromProtocol ?? tokenFromAuth;
      const auth = await this.verifyUser(token ?? undefined);
      if (!auth) {
        return c.json({ error: 'unauthorized' }, 401);
      }
      c.set('auth', auth);
      await next();
    });

    this.app.get('/', (c) => c.json(this.snapshot()));

    this.app.get(
      '/websocket',
      upgradeWebSocket((c) => {
        const auth = c.get('auth');
        const protocolHeader = c.req.header('sec-websocket-protocol') ?? undefined;
        return {
          protocol: protocolHeader,
          onOpen: (_event, ws) => {
            this.connections.set(auth.userId, ws);
            ws.send(JSON.stringify({ type: 'state', state: this.snapshot() } satisfies BroadcastEnvelope));
          },
          onMessage: (event, ws) => {
            void this.handleMessage(auth, event.data, ws);
          },
          onClose: () => this.connections.delete(auth.userId),
          onError: () => this.connections.delete(auth.userId)
        };
      })
    );

    this.app.get('/state', (c) => c.json(this.snapshot()));
  }

  fetch(request: Request) {
    return this.app.fetch(request, this.env, this.state);
  }

  private async verifyWithJwks(raw: string): Promise<AuthContext | null> {
    const verified: JWTVerifyResult<JWTPayload> = await jwtVerify(raw, this.googleJwks, {
      audience: this.env.GOOGLE_CLIENT_ID,
      issuer: ['https://accounts.google.com', 'accounts.google.com']
    });
    const payload = verified.payload;
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) return null;
    const userName = typeof payload.name === 'string'
      ? payload.name
      : typeof payload.email === 'string'
        ? payload.email
        : 'Guest';
    return { userId, userName };
  }

  private async verifyWithTokenInfo(raw: string): Promise<AuthContext | null> {
    const tokeninfoUrl = this.env.GOOGLE_TOKENINFO_URL || 'https://oauth2.googleapis.com/tokeninfo';
    const res = await fetch(`${tokeninfoUrl}?id_token=${encodeURIComponent(raw)}`);
    if (!res.ok) return null;
    const payload = (await res.json()) as JWTPayload & { aud?: string; sub?: string; name?: string; email?: string };
    if (payload.aud !== this.env.GOOGLE_CLIENT_ID) return null;
    const userId = typeof payload.sub === 'string' ? payload.sub : undefined;
    if (!userId) return null;
    const userName = typeof payload.name === 'string'
      ? payload.name
      : typeof payload.email === 'string'
        ? payload.email
        : 'Guest';
    return { userId, userName };
  }

  private async verifyUser(token?: string): Promise<AuthContext | null> {
    const bearer = token?.trim();
    if (!bearer) return null;
    const raw = bearer.startsWith('Bearer ') ? bearer.slice('Bearer '.length) : bearer;
    try {
      return await this.verifyWithJwks(raw);
    } catch (err) {
      console.warn('JWKS verification failed, falling back to tokeninfo', err);
      try {
        return await this.verifyWithTokenInfo(raw);
      } catch (infoErr) {
        console.warn('Tokeninfo verification failed', infoErr);
        return null;
      }
    }
  }

  private async ensureTables() {
    if (!this.tablesReady) {
      this.tablesReady = (async () => {
        const createStateTable =
          'CREATE TABLE IF NOT EXISTS dice_room_state (room_id TEXT PRIMARY KEY, state_json TEXT NOT NULL, updated_at INTEGER NOT NULL)';
        const createRollTable =
          'CREATE TABLE IF NOT EXISTS dice_room_rolls (id TEXT PRIMARY KEY, room_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)';
        await this.env.DB.prepare(createStateTable).run();
        await this.env.DB.prepare(createRollTable).run();
      })();
    }
    await this.tablesReady;
  }

  private currentTimer(now = Date.now()): TimerState & { running: boolean } {
    const running = this.timer.startedAt !== null;
    const elapsed = running ? this.timer.elapsed + (now - (this.timer.startedAt ?? now)) : this.timer.elapsed;
    return { running, elapsed, startedAt: this.timer.startedAt };
  }

  private snapshot(now = Date.now()): RoomSnapshot {
    return {
      roomId: this.roomId,
      timer: this.currentTimer(now),
      lastRoll: this.lastRoll
    };
  }

  private async persistState(now = Date.now()) {
    await this.ensureTables();
    const stateJson = JSON.stringify(this.snapshot(now));
    const updated = now;
    await this.env.DB.prepare(
      'INSERT INTO dice_room_state (room_id, state_json, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(room_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at'
    )
      .bind(this.roomId, stateJson, updated)
      .run();
  }

  private async logRoll(event: RollEvent) {
    await this.ensureTables();
    const payload = JSON.stringify(event);
    await this.env.DB.prepare('INSERT INTO dice_room_rolls (id, room_id, payload, created_at) VALUES (?1, ?2, ?3, ?4)')
      .bind(event.id, this.roomId, payload, event.at)
      .run();
  }

  private broadcast(envelope: BroadcastEnvelope) {
    const message = JSON.stringify(envelope);
    for (const [userId, socket] of this.connections) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(message);
      } else {
        this.connections.delete(userId);
      }
    }
  }

  private async handleMessage(auth: AuthContext, rawMessage: unknown, socket: WebSocket) {
    const payload = parseJsonMessage(rawMessage);
    if (!payload) {
      socket.send(JSON.stringify({ type: 'error', message: 'invalid_json' }));
      return;
    }

    const kind = payload.type;
    if (kind === 'roll') {
      const sides = Number(payload.sides ?? 6);
      const result = rollDie(sides);
      const event: RollEvent = {
        kind: 'roll',
        id: crypto.randomUUID(),
        userId: auth.userId,
        userName: auth.userName,
        sides: Number.isFinite(sides) ? Math.floor(sides) : 6,
        result,
        at: Date.now()
      };
      this.lastRoll = event;
      await this.logRoll(event);
      await this.persistState(event.at);
      this.broadcast({ type: 'roll', event, state: this.snapshot(event.at) });
      return;
    }

    if (kind === 'timer-resume') {
      if (this.timer.startedAt === null) {
        this.timer.startedAt = Date.now();
        await this.persistState();
      }
      this.broadcast({ type: 'timer', state: this.snapshot() });
      return;
    }

    if (kind === 'timer-pause') {
      if (this.timer.startedAt !== null) {
        const now = Date.now();
        this.timer.elapsed += now - this.timer.startedAt;
        this.timer.startedAt = null;
        await this.persistState(now);
      }
      this.broadcast({ type: 'timer', state: this.snapshot() });
      return;
    }

    if (kind === 'timer-stop') {
      const now = Date.now();
      if (this.timer.startedAt !== null) {
        this.timer.elapsed += now - this.timer.startedAt;
        this.timer.startedAt = null;
      }
      await this.persistState(now);
      this.broadcast({ type: 'timer', state: this.snapshot(now), stoppedAt: now });
      return;
    }

    if (kind === 'state') {
      socket.send(JSON.stringify({ type: 'state', state: this.snapshot() } satisfies BroadcastEnvelope));
      return;
    }

    socket.send(JSON.stringify({ type: 'error', message: 'unknown_command' }));
  }
}
