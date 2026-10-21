import type { Asset, BoardData, RoomSettings } from '../types';
import type { AssetMeta, ClientMessage, ItemChange, Patch, ServerMessage } from '../shared/protocol';
import { assetUrl } from '../shared/protocol';
import { useBoard } from '../store';
import { useSession } from './session';
import { zoomToFit } from '../lib/view';

/** Revision of each item as last agreed with (or optimistically sent to) the server. */
const revs = new Map<string, number>();
const dirtyItems = new Set<string>();
const dirtyCards = new Set<string>();
const dirtyAssets = new Set<string>();

let socket: WebSocket | null = null;
let roomId: string | null = null;
let applying = false;
let closing = false;
let retryDelay = 1000;
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let queue: Promise<void> = Promise.resolve();
let seed: BoardData | null = null;
let unsubscribe: (() => void) | null = null;
let fitted = false;

/** How often local changes are sent while something is being dragged. */
const FLUSH_MS = 50;

export function connectRoom(id: string, seedBoard: BoardData | null) {
  roomId = id;
  seed = seedBoard;
  closing = false;
  unsubscribe?.();
  unsubscribe = useBoard.subscribe((s, prev) => {
    if (applying || !socket) return;
    let changed = false;
    if (s.items !== prev.items) changed = markChanged(s.items, prev.items, dirtyItems) || changed;
    if (s.cards !== prev.cards) changed = markChanged(s.cards, prev.cards, dirtyCards) || changed;
    if (s.assets !== prev.assets) changed = markChanged(s.assets, prev.assets, dirtyAssets) || changed;
    if (changed && !flushTimer) flushTimer = setTimeout(scheduleFlush, FLUSH_MS);
  });
  open();
}

export function disconnectRoom() {
  closing = true;
  unsubscribe?.();
  unsubscribe = null;
  socket?.close();
  socket = null;
}

function markChanged<T>(next: Record<string, T>, prev: Record<string, T>, into: Set<string>) {
  let changed = false;
  for (const id in next) {
    if (next[id] !== prev[id]) {
      into.add(id);
      changed = true;
    }
  }
  for (const id in prev) {
    if (!(id in next)) {
      into.add(id);
      changed = true;
    }
  }
  return changed;
}

function open() {
  const { me } = useSession.getState();
  const params = new URLSearchParams({ room: roomId!, player: me.id, name: me.name, colour: me.colour });
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws?${params}`);
  socket = ws;
  ws.onmessage = (e) => receive(JSON.parse(e.data) as ServerMessage);
  ws.onopen = () => {
    retryDelay = 1000;
  };
  ws.onclose = (e) => {
    if (socket !== ws) return;
    if (e.code === 4404) {
      useSession.setState({ status: 'missing' });
      return;
    }
    if (closing) return;
    useSession.setState({ status: 'reconnecting' });
    setTimeout(() => !closing && socket === ws && open(), retryDelay);
    retryDelay = Math.min(retryDelay * 2, 10_000);
  };
}

function send(msg: ClientMessage) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

const toAsset = (m: AssetMeta): Asset => ({ ...m, src: assetUrl(roomId!, m.id) });

function remote(fn: () => void) {
  applying = true;
  try {
    fn();
  } finally {
    applying = false;
  }
}

function applyPatch(p: Patch) {
  const items: Record<string, ItemChange['item']> = {};
  for (const [id, ch] of Object.entries(p.items ?? {})) {
    items[id] = ch.item;
    if (ch.item) revs.set(id, ch.rev);
    else revs.delete(id);
    // The server's value replaces any unsent local change.
    dirtyItems.delete(id);
  }
  const assets: Record<string, Asset> = {};
  for (const [id, m] of Object.entries(p.assets ?? {})) assets[id] = toAsset(m);
  remote(() =>
    useBoard.getState().applyRemote({
      items: p.items ? items : undefined,
      cards: p.cards,
      assets: p.assets ? assets : undefined,
    }),
  );
}

function receive(msg: ServerMessage) {
  switch (msg.type) {
    case 'init': {
      revs.clear();
      dirtyItems.clear();
      dirtyCards.clear();
      dirtyAssets.clear();
      const items: BoardData['items'] = {};
      for (const [id, ch] of Object.entries(msg.items)) {
        if (!ch.item) continue;
        items[id] = ch.item;
        revs.set(id, ch.rev);
      }
      const assets: Record<string, Asset> = {};
      for (const [id, m] of Object.entries(msg.assets)) assets[id] = toAsset(m);
      remote(() =>
        useBoard.getState().loadBoard({ version: 1, items, cards: msg.cards, assets, camera: useBoard.getState().camera }),
      );
      useSession.setState({ status: 'online', settings: msg.settings, players: msg.players });
      // Bring the local board into a newly created room.
      if (seed && Object.keys(items).length === 0) {
        const board = seed;
        seed = null;
        useBoard.getState().loadBoard({ ...board, camera: useBoard.getState().camera });
      }
      if (!fitted) {
        fitted = true;
        requestAnimationFrame(zoomToFit);
      }
      break;
    }
    case 'patch':
      applyPatch(msg);
      break;
    case 'reject':
      applyPatch({ items: msg.items });
      break;
    case 'settings':
      useSession.setState({ settings: msg.settings });
      break;
    case 'players': {
      const online = new Set(msg.players.filter((p) => p.online).map((p) => p.id));
      const cursors = { ...useSession.getState().cursors };
      for (const id in cursors) if (!online.has(id)) delete cursors[id];
      useSession.setState({ players: msg.players, cursors });
      break;
    }
    case 'cursor':
      useSession.setState((s) => ({ cursors: { ...s.cursors, [msg.playerId]: { x: msg.x, y: msg.y, at: Date.now() } } }));
      break;
  }
}

function scheduleFlush() {
  flushTimer = undefined;
  queue = queue.then(flush).catch((e) => console.error('Sync failed', e));
}

async function flush() {
  if (socket?.readyState !== WebSocket.OPEN) return;
  const s = useBoard.getState();

  // Upload new images before anything refers to them.
  const assets: Record<string, AssetMeta> = {};
  for (const id of [...dirtyAssets]) {
    dirtyAssets.delete(id);
    const a = s.assets[id];
    if (!a || !a.src.startsWith('data:')) continue;
    const blob = await (await fetch(a.src)).blob();
    const res = await fetch(assetUrl(roomId!, id), { method: 'PUT', body: blob, headers: { 'content-type': blob.type } });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    assets[id] = { id, width: a.width, height: a.height, name: a.name };
  }

  // Read state again: it may have moved on during uploads.
  const now = useBoard.getState();
  const items: Record<string, ItemChange> = {};
  for (const id of dirtyItems) {
    const item = now.items[id] ?? null;
    const base = revs.get(id) ?? 0;
    if (!item && base === 0) continue;
    items[id] = { item, rev: base };
    if (item) revs.set(id, base + 1);
    else revs.delete(id);
  }
  dirtyItems.clear();

  const cards: Patch['cards'] = {};
  for (const id of dirtyCards) {
    const c = now.cards[id];
    if (c && !c.hidden) cards[id] = c;
  }
  dirtyCards.clear();

  const patch: ClientMessage = { type: 'patch' };
  if (Object.keys(items).length) patch.items = items;
  if (Object.keys(cards).length) patch.cards = cards;
  if (Object.keys(assets).length) patch.assets = assets;
  if (patch.items || patch.cards || patch.assets) send(patch);
}

export function sendSettings(settings: RoomSettings) {
  useSession.setState({ settings });
  send({ type: 'settings', settings });
}

export function sendIdentity(name: string, colour: string) {
  send({ type: 'rename', name, colour });
}

let lastCursor = 0;
export function sendCursor(x: number, y: number) {
  const t = performance.now();
  if (t - lastCursor < FLUSH_MS || !roomId) return;
  lastCursor = t;
  send({ type: 'cursor', x: Math.round(x), y: Math.round(y) });
}
