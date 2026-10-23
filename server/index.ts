import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer } from 'ws';
import type { ClientMessage } from '../src/shared/protocol.ts';
import { ID_PATTERN } from '../src/shared/protocol.ts';
import { RoomStore, type Connection } from './rooms.ts';
import { Auth, loginPage, safeNext } from './auth.ts';
import { Library } from './library.ts';
import type { LibraryDeck } from '../src/shared/library.ts';

const PORT = Number(process.env.PORT ?? 8787);
const DATA_DIR = resolve(process.env.DATA_DIR ?? process.env.RAILWAY_VOLUME_MOUNT_PATH ?? 'data');
const STATIC_DIR = resolve('dist');
const MAX_ASSET_BYTES = 25 * 1024 * 1024;

const store = new RoomStore(DATA_DIR);
const auth = new Auth(process.env.SITE_PASSWORD, process.env.ADMIN_PASSWORD);
const library = new Library(DATA_DIR);
await library.load();

/** Library decks for the given ids, or an error message. */
function libraryDecks(ids: unknown): LibraryDeck[] | string {
  if (ids === undefined) return [];
  if (!Array.isArray(ids) || ids.length > 50) return 'Bad deck list';
  const decks = ids.map((id) => library.get(String(id)));
  return decks.every(Boolean) ? (decks as LibraryDeck[]) : 'A chosen deck is no longer in the library';
}

async function readJson(req: IncomingMessage, limit: number): Promise<Record<string, unknown> | null> {
  const body = await readBody(req, limit);
  if (!body) return null;
  try {
    const v = JSON.parse(body.toString() || '{}');
    return v && typeof v === 'object' ? v : null;
  } catch {
    return null;
  }
}

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

  if (parts[0] === 'library') return handleLibrary(req, res, parts.slice(1));

  // POST /api/rooms {settings, deckIds}
  if (parts[0] === 'rooms' && parts.length === 1 && req.method === 'POST') {
    const body = await readJson(req, 100_000);
    if (!body) return json(res, 400, { error: 'Invalid JSON' });
    const decks = libraryDecks(body.deckIds);
    if (typeof decks === 'string') return json(res, 400, { error: decks });
    const room = await store.create(newId(), (body.settings ?? {}) as object);
    if (decks.length) await room.addDecks(decks, (id) => library.assetPath(id), (id) => library.mime(id));
    return json(res, 201, { id: room.data.id });
  }

  if (parts[0] !== 'rooms' || !ID_PATTERN.test(parts[1] ?? '')) return json(res, 404, { error: 'Not found' });
  const room = await store.get(parts[1]);
  if (!room) return json(res, 404, { error: 'No such room' });

  // GET /api/rooms/:id
  if (parts.length === 2 && req.method === 'GET') return json(res, 200, { id: room.data.id, settings: room.data.settings });

  // POST /api/rooms/:id/decks {deckIds}
  if (parts[2] === 'decks' && parts.length === 3 && req.method === 'POST') {
    const body = await readJson(req, 100_000);
    const decks = libraryDecks(body?.deckIds);
    if (typeof decks === 'string' || !decks.length) return json(res, 400, { error: typeof decks === 'string' ? decks : 'No decks chosen' });
    const ids = await room.addDecks(decks, (id) => library.assetPath(id), (id) => library.mime(id));
    return json(res, 201, { ids });
  }

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

async function handleLibrary(req: IncomingMessage, res: ServerResponse, parts: string[]) {
  // GET /api/library
  if (parts.length === 0 && req.method === 'GET') return json(res, 200, { decks: library.list() });

  // PUT|GET /api/library/assets/:id
  if (parts[0] === 'assets' && parts.length === 2 && ID_PATTERN.test(parts[1])) {
    const id = parts[1];
    if (req.method === 'PUT') {
      const mime = String(req.headers['content-type'] ?? '');
      if (!mime.startsWith('image/')) return json(res, 415, { error: 'Images only' });
      const body = await readBody(req, MAX_ASSET_BYTES);
      if (!body) return json(res, 413, { error: 'Image too large' });
      await library.putAsset(id, mime, body);
      return json(res, 201, { ok: true });
    }
    if (req.method === 'GET') {
      const mime = library.mime(id);
      if (!mime || !existsSync(library.assetPath(id))) return json(res, 404, { error: 'No such image' });
      res.writeHead(200, { 'content-type': mime, 'cache-control': 'private, max-age=31536000, immutable' });
      return createReadStream(library.assetPath(id)).pipe(res);
    }
  }

  // POST /api/library/decks
  if (parts[0] === 'decks' && parts.length === 1 && req.method === 'POST') {
    const body = await readJson(req, 5_000_000);
    if (!body) return json(res, 400, { error: 'Invalid JSON' });
    const result = await library.save(newId(), body);
    return typeof result === 'string' ? json(res, 400, { error: result }) : json(res, 201, { id: result.id });
  }

  // GET|PUT|PATCH|DELETE /api/library/decks/:id
  if (parts[0] === 'decks' && parts.length === 2 && ID_PATTERN.test(parts[1])) {
    const id = parts[1];
    const deck = library.get(id);
    if (!deck) return json(res, 404, { error: 'No such deck' });
    if (req.method === 'GET') return json(res, 200, deck);
    if (req.method === 'PUT') {
      const body = await readJson(req, 5_000_000);
      if (!body) return json(res, 400, { error: 'Invalid JSON' });
      const result = await library.save(id, body);
      return typeof result === 'string' ? json(res, 400, { error: result }) : json(res, 200, { id });
    }
    if (req.method === 'PATCH') {
      const body = await readJson(req, 10_000);
      await library.rename(id, String(body?.name ?? ''));
      return json(res, 200, { id });
    }
    if (req.method === 'DELETE') {
      await library.remove(id);
      return json(res, 200, { ok: true });
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

/**
 * The deck-building board (every app page except tables) and creating rooms
 * are for admins; tables, their images and the built files are for everyone.
 */
function needsAdmin(req: IncomingMessage, pathname: string) {
  if (pathname === '/api/rooms' && req.method === 'POST') return true;
  if (/^\/api\/rooms\/[^/]+\/decks$/.test(pathname)) return true;
  if (pathname === '/api/library' || pathname.startsWith('/api/library/')) return true;
  if (pathname.startsWith('/api/') || pathname.startsWith('/r/') || pathname.startsWith('/assets/')) return false;
  return true;
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (auth.enabled) {
    if (url.pathname === '/login') {
      const role = url.searchParams.has('admin') ? 'admin' : 'site';
      const next = safeNext(url.searchParams.get('next'));
      const ok = role === 'admin' ? auth.isAdmin(req) : auth.hasSiteAccess(req);
      if (ok) return void res.writeHead(303, { location: next }).end();
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      return void res.end(loginPage(url.searchParams.get('error'), next, role));
    }
    if (url.pathname === '/api/login' && req.method === 'POST') {
      return void auth.login(req, res).catch(() => res.writeHead(400).end());
    }
    if (url.pathname === '/api/logout') return auth.logout(res);
    if (!auth.isPublic(url.pathname)) {
      // The admin login also grants site access, so admin pages go straight to it.
      if (needsAdmin(req, url.pathname) && !auth.isAdmin(req)) return auth.deny(req, res, url.pathname, 'admin');
      if (!auth.hasSiteAccess(req)) return auth.deny(req, res, url.pathname, 'site');
    }
  }
  if (url.pathname === '/api/me') return json(res, 200, { admin: auth.isAdmin(req) });
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
  verifyClient: ({ req }: { req: IncomingMessage }) => auth.hasSiteAccess(req),
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

  const conn: Connection = { socket, playerId, admin: auth.isAdmin(req), sentCards: new Map(), sentAssets: new Set() };
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
  console.log(`Cardplayer listening on :${PORT}, data in ${DATA_DIR}, site password ${process.env.SITE_PASSWORD ? 'set' : 'not set'}, admin password ${process.env.ADMIN_PASSWORD ? 'set' : 'not set'}`),
);
