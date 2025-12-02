import { Hono } from 'hono';
import type { Context } from 'hono';
import { DiceRoom } from './durable_objects/DiceRoom';

type Env = {
  DB: D1Database;
  DICE_ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
  GOOGLE_CLIENT_ID: string;
};

const api = new Hono<{ Bindings: Env }>();

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

const app = new Hono<{ Bindings: Env }>();
app.route('/api', api);

const worker = {
  fetch: (request: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return app.fetch(request, env, ctx);
    }
    return env.ASSETS.fetch(request);
  }
};

export default worker;
export { DiceRoom };
