import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import type { ClientMessage } from '../src/shared/protocol.ts';
import { ID_PATTERN } from '../src/shared/protocol.ts';
import { RoomStore, type Connection } from './rooms.ts';
import { SiteAuth, loginPage, safeNext } from './auth.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = resolve(process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? 'data');
const STATIC_DIR = resolve('dist');
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const store = new RoomStore(DATA_DIR);
const auth = process.env.SITE_PASSWORD ? new SiteAuth(process.env.SITE_PASSWORD) : null;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
};

const newId = () => randomBytes(8).toString('hex').slice(0, 10);

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage, limit: number): Promise<Buffer | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) return null;
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

async function handleApi(req: IncomingMessage, res: ServerResponse, parts: string[]) {
  // /api/health
  if (parts[0] === 'health') return json(res, 200, { ok: true });

  // POST /api/rooms
  if (parts[0] === 'rooms' && parts.length === 1 && req.method === 'POST') {
    const body = await readBody(req, 10_000);
    let settings = {};
    try {
      settings = JSON.parse(body?.toString() || '{}').settings ?? {};
    } catch {
      return json(res, 400, { error: 'Invalid JSON' });
    }
    const room = await store.create(newId(), settings);
    return json(res, 201, { id: room.data.id });
  }

  if (parts[0] !== 'rooms' || !ID_PATTERN.test(parts[1] ?? '')) return json(res, 404, { error: 'Not found' });
  const room = await store.get(parts[1]);
  if (!room) return json(res, 404, { error: 'No such room' });

  // GET /api/rooms/:id
  if (parts.length === 2 && req.method === 'GET') return json(res, 200, { id: room.data.id, settings: room.data.settings });

  // PUT|GET /api/rooms/:id/assets/:assetId
  if (parts[2] === 'assets' && ID_PATTERN.test(parts[3] ?? '') && parts.length === 4) {
    const file = join(room.assetDir, parts[3]);
    if (req.method === 'PUT') {
      const mime = String(req.headers['content-type'] ?? '');
      if (!mime.startsWith('image/')) return json(res, 415, { error: 'Images only' });
      const body = await readBody(req, MAX_ASSET_BYTES);
      if (!body) return json(res, 413, { error: 'Image too large' });
      await mkdir(room.assetDir, { recursive: true });
      await writeFile(file, body);
      room.addAsset({ id: parts[3], mime, width: 0, height: 0, name: '' });
      return json(res, 201, { ok: true });
    }
    if (req.method === 'GET') {
      const meta = room.data.assets[parts[3]];
      if (!meta || !existsSync(file)) return json(res, 404, { error: 'No such asset' });
      res.writeHead(200, { 'content-type': meta.mime, 'cache-control': 'private, max-age=31536000, immutable' });
      return createReadStream(file).pipe(res);
    }
  }
  return json(res, 404, { error: 'Not found' });
}

function serveStatic(req: IncomingMessage, res: ServerResponse, pathname: string) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(STATIC_DIR, rel);
  // Unknown paths (such as /r/<room>) get the app shell.
  if (!file.startsWith(STATIC_DIR) || !existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404).end('Run `npm run build` first.');
    return;
  }
  const hashed = pathname.startsWith('/assets/');
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': hashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (auth) {
    if (url.pathname === '/login') {
      const next = safeNext(url.searchParams.get('next'));
      if (auth.isAuthorised(req)) return void res.writeHead(303, { location: next }).end();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return void res.end(loginPage(url.searchParams.get('error'), next));
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      return void auth.login(req, res).catch(() => res.writeHead(400).end());
    }
    if (url.pathname === '/api/logout') return auth.logout(res);
    if (!auth.isPublic(url.pathname) && !auth.isAuthorised(req)) return auth.deny(req, res, url.pathname);
  }
  if (url.pathname.startsWith('/api/')) {
    handleApi(req, res, url.pathname.slice(5).split('/').filter(Boolean)).catch((e) => {
      console.error(e);
      if (!res.headersSent) json(res, 500, { error: 'Server error' });
    });
  } else {
    serveStatic(req, res, url.pathname);
  }
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 5 * 1024 * 1024,
  verifyClient: ({ req }: { req: IncomingMessage }) => !auth || auth.isAuthorised(req),
});

wss.on('connection', async (socket, req) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const roomId = url.searchParams.get('room') ?? '';
  const playerId = url.searchParams.get('player') ?? '';
  const name = (url.searchParams.get('name') ?? 'Player').slice(0, 40);
  const colour = /^#[0-9a-f]{6}$/i.test(url.searchParams.get('colour') ?? '') ? url.searchParams.get('colour')! : '#2f5d8a';
  if (!ID_PATTERN.test(roomId) || !ID_PATTERN.test(playerId)) return socket.close(4400, 'Bad request');

  // Buffer messages that arrive while the room loads.
  const early: string[] = [];
  const buffer = (data: unknown) => early.push(String(data));
  socket.on('message', buffer);

  const room = await store.get(roomId);
  if (!room) return socket.close(4404, 'No such room');

  const conn: Connection = { socket, playerId, sentCards: new Map(), sentAssets: new Set() };
  const handle = (raw: string) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'patch':
        room.applyPatch(conn, msg);
        break;
      case 'settings':
        room.setSettings(msg.settings);
        break;
      case 'rename':
        room.rename(conn, String(msg.name).slice(0, 40), /^#[0-9a-f]{6}$/i.test(msg.colour) ? msg.colour : colour);
        break;
      case 'cursor':
        if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) room.cursor(conn, msg.x, msg.y);
        break;
    }
  };

  room.join(conn, name, colour);
  socket.off('message', buffer);
  early.forEach(handle);
  socket.on('message', (data) => handle(String(data)));
  socket.on('close', () => room.leave(conn));
});

// Keep idle connections alive through proxies.
setInterval(() => {
  for (const ws of wss.clients) ws.ping();
}, 30_000).unref();

async function shutdown() {
  await store.saveAll().catch((e) => console.error(e));
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

server.listen(PORT, () =>
  console.log(`Cardplayer listening on :${PORT}, data in ${DATA_DIR}, password ${auth ? 'required' : 'not set'}`),
);
