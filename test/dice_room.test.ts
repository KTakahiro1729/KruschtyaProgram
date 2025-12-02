import { env } from 'cloudflare:test';
import { setTimeout as sleep } from 'timers/promises';

const originalFetch = globalThis.fetch;

function mockTokenInfoFetch() {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' || input instanceof URL ? new URL(input.toString()) : new URL(input.url);
    if (url.hostname === 'oauth2.googleapis.com' && url.pathname.includes('/tokeninfo')) {
      const token = url.searchParams.get('id_token') ?? '';
      const name = token.includes('alice') ? 'Alice' : token.includes('bob') ? 'Bob' : 'Guest';
      return new Response(
        JSON.stringify({ aud: env.GOOGLE_CLIENT_ID, sub: token || 'guest', name }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    }
    if (url.hostname === 'www.googleapis.com' && url.pathname.includes('/oauth2/v3/certs')) {
      return new Response(JSON.stringify({ keys: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    return originalFetch(input as any, init);
  };
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

type RollEnvelope = {
  type: 'roll';
  event: { id: string; result: number; userId: string; userName: string; sides: number };
  state: { roomId: string };
};

type TimerEnvelope = {
  type: 'timer';
  state: { timer: { running: boolean; elapsed: number; startedAt: number | null } };
  stoppedAt?: number;
};

type StateEnvelope = {
  type: 'state';
};

type Envelope = RollEnvelope | TimerEnvelope | StateEnvelope | { type: 'error'; message: string };

function decodeMessage(data: unknown): Envelope | null {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data) as Envelope;
    } catch (err) {
      console.warn('Failed to parse message', err);
      return null;
    }
  }
  if (data instanceof ArrayBuffer) {
    try {
      return JSON.parse(new TextDecoder().decode(data)) as Envelope;
    } catch (err) {
      console.warn('Failed to parse binary message', err);
      return null;
    }
  }
  return null;
}

async function connect(roomId: string, token: string) {
  const id = env.DICE_ROOM.idFromName(roomId);
  const stub = env.DICE_ROOM.get(id);
  const res = await stub.fetch(`https://example.com/websocket`, {
    headers: {
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      'Sec-WebSocket-Protocol': token
    }
  });
  expect(res.status).toBe(101);
  const ws = res.webSocket;
  expect(ws).toBeTruthy();
  ws!.accept();
  return ws!;
}

function waitForMessage<T extends Envelope>(
  ws: WebSocket,
  predicate: (msg: Envelope) => msg is T,
  timeoutMs = 2000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for message')), timeoutMs);
    ws.addEventListener('message', (event) => {
      const decoded = decodeMessage(event.data);
      if (!decoded) return;
      if (predicate(decoded)) {
        clearTimeout(timer);
        resolve(decoded);
      }
    });
  });
}

const isRoll = (msg: Envelope): msg is RollEnvelope => msg.type === 'roll';
const isTimer = (msg: Envelope): msg is TimerEnvelope => msg.type === 'timer';
const isState = (msg: Envelope): msg is StateEnvelope => msg.type === 'state';

describe('DiceRoom Durable Object', () => {
  beforeEach(() => mockTokenInfoFetch());
  afterEach(() => restoreFetch());

  it('rejects websocket upgrade without idToken', async () => {
    const id = env.DICE_ROOM.idFromName('unauthorized-room');
    const stub = env.DICE_ROOM.get(id);
    const res = await stub.fetch('https://example.com/websocket');
    expect(res.status).toBe(401);
  });

  it('synchronizes roll results and timer stop events', async () => {
    const roomId = 'sync-room';
    const alice = await connect(roomId, 'alice-token');
    const bob = await connect(roomId, 'bob-token');

    await waitForMessage(alice, isState);
    await waitForMessage(bob, isState);

    alice.send(JSON.stringify({ type: 'roll', sides: 8 }));
    const aliceRoll = await waitForMessage(alice, isRoll);
    const bobRoll = await waitForMessage(bob, isRoll);

    expect(aliceRoll.event.id).toBe(bobRoll.event.id);
    expect(aliceRoll.event.result).toBeGreaterThanOrEqual(1);
    expect(aliceRoll.event.result).toBeLessThanOrEqual(8);

    bob.send(JSON.stringify({ type: 'timer-resume' }));
    const resumed = await waitForMessage(bob, isTimer);
    expect(resumed.state.timer.running).toBe(true);

    await sleep(10);
    alice.send(JSON.stringify({ type: 'timer-stop' }));
    const aliceStop = await waitForMessage(alice, isTimer);
    const bobStop = await waitForMessage(bob, isTimer);

    expect(aliceStop.stoppedAt).toBeDefined();
    expect(aliceStop.stoppedAt).toBe(bobStop.stoppedAt);
    expect(aliceStop.state.timer.running).toBe(false);

    alice.close();
    bob.close();
  });
});
