import { mkdir, readFile, rename, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WebSocket } from 'ws';
import type { BoardItem, Card, Player, RoomSettings } from '../src/types.ts';
import type { AssetMeta, ItemChange, Patch, ServerMessage } from '../src/shared/protocol.ts';
import { DEFAULT_SETTINGS } from '../src/shared/protocol.ts';
import { redactCard, visibleCardIds } from '../src/shared/visibility.ts';

export interface RoomData {
  id: string;
  created: string;
  settings: RoomSettings;
  items: Record<string, BoardItem>;
  revs: Record<string, number>;
  cards: Record<string, Card>;
  assets: Record<string, AssetMeta & { mime: string }>;
  players: Record<string, Omit<Player, 'online'>>;
}

export interface Connection {
  socket: WebSocket;
  playerId: string;
  /** Admins may add new cards (when copying their board into a new table). */
  admin: boolean;
  /** What this connection has been sent, so only changes are re-sent. */
  sentCards: Map<string, Card>;
  sentAssets: Set<string>;
}

/** Redacted copies, cached so unchanged hidden cards compare equal by reference. */
const redacted = new WeakMap<Card, Card>();
const redact = (c: Card) => {
  let r = redacted.get(c);
  if (!r) redacted.set(c, (r = redactCard(c)));
  return r;
};

export class Room {
  data: RoomData;
  connections = new Set<Connection>();
  private dir: string;
  private saveTimer: NodeJS.Timeout | undefined;
  /** Uploaded assets not yet referenced, with upload time, protected from garbage collection. */
  private pendingAssets = new Map<string, number>();

  constructor(data: RoomData, dataDir: string) {
    this.data = data;
    this.dir = dataDir;
  }

  get assetDir() {
    return join(this.dir, 'assets', this.data.id);
  }

  players(): Player[] {
    const online = new Set([...this.connections].map((c) => c.playerId));
    return Object.values(this.data.players).map((p) => ({ ...p, online: online.has(p.id) }));
  }

  join(conn: Connection, name: string, colour: string) {
    this.data.players[conn.playerId] = { id: conn.playerId, name, colour };
    this.connections.add(conn);
    const items: Record<string, ItemChange> = {};
    for (const [id, item] of Object.entries(this.data.items)) items[id] = { item, rev: this.data.revs[id] ?? 1 };
    const view = this.viewChanges(conn);
    this.send(conn, {
      type: 'init',
      roomId: this.data.id,
      settings: this.data.settings,
      players: this.players(),
      items,
      cards: (view.cards ?? {}) as Record<string, Card>,
      assets: view.assets ?? {},
    });
    this.broadcast({ type: 'players', players: this.players() });
    this.scheduleSave();
  }

  leave(conn: Connection) {
    this.connections.delete(conn);
    this.broadcast({ type: 'players', players: this.players() });
  }

  rename(conn: Connection, name: string, colour: string) {
    const p = this.data.players[conn.playerId];
    if (!p) return;
    p.name = name;
    p.colour = colour;
    this.broadcast({ type: 'players', players: this.players() });
    this.scheduleSave();
  }

  setSettings(settings: RoomSettings) {
    this.data.settings = {
      privateHands: !!settings.privateHands,
      hideFaceDown: !!settings.hideFaceDown,
    };
    this.broadcast({ type: 'settings', settings: this.data.settings });
    this.syncViews();
    this.scheduleSave();
  }

  cursor(conn: Connection, x: number, y: number) {
    this.broadcast({ type: 'cursor', playerId: conn.playerId, x, y }, conn);
  }

  addAsset(meta: AssetMeta & { mime: string }) {
    this.data.assets[meta.id] = meta;
    this.pendingAssets.set(meta.id, Date.now());
  }

  applyPatch(from: Connection, patch: Patch) {
    const d = this.data;

    // Item changes are all-or-nothing: each must be based on the current revision.
    const applied: Record<string, ItemChange> = {};
    if (patch.items) {
      const entries = Object.entries(patch.items);
      const conflict = entries.some(([id, ch]) => (d.revs[id] ?? 0) !== ch.rev);
      if (conflict) {
        const truth: Record<string, ItemChange> = {};
        for (const [id] of entries) truth[id] = { item: d.items[id] ?? null, rev: d.revs[id] ?? 0 };
        this.send(from, { type: 'reject', items: truth });
      } else {
        for (const [id, ch] of entries) {
          if (ch.item && ch.item.id === id) {
            d.items[id] = ch.item;
            d.revs[id] = ch.rev + 1;
            applied[id] = { item: ch.item, rev: ch.rev + 1 };
          } else {
            delete d.items[id];
            delete d.revs[id];
            applied[id] = { item: null, rev: 0 };
          }
        }
      }
    }

    if (patch.assets) {
      for (const [id, meta] of Object.entries(patch.assets)) {
        // The file must already have been uploaded.
        const existing = d.assets[id];
        if (existing) {
          d.assets[id] = { ...existing, width: Number(meta.width) || 0, height: Number(meta.height) || 0, name: String(meta.name) };
          this.pendingAssets.delete(id);
        }
      }
    }

    if (patch.cards) {
      const visible = visibleCardIds(d.items, d.settings, from.playerId);
      for (const [id, card] of Object.entries(patch.cards)) {
        // Deletions are handled by garbage collection; hidden copies never overwrite real cards.
        if (!card || card.hidden || card.id !== id) continue;
        // Decks are built on the admin board, so players cannot add cards to a table.
        if (!d.cards[id] && !from.admin) continue;
        if (d.cards[id] && !visible.has(id)) continue;
        d.cards[id] = card;
        // The sender already holds this exact card.
        from.sentCards.set(id, card);
      }
    }

    this.collectGarbage();

    if (Object.keys(applied).length) {
      for (const conn of this.connections) {
        if (conn !== from) this.send(conn, { type: 'patch', items: applied });
      }
    }
    this.syncViews();
    this.scheduleSave();
  }

  /** Send each connection the cards and assets whose visibility or content changed. */
  private syncViews() {
    for (const conn of this.connections) {
      const view = this.viewChanges(conn);
      if (view.cards || view.assets) this.send(conn, { type: 'patch', ...view });
    }
  }

  private viewChanges(conn: Connection): Patch {
    const d = this.data;
    const visible = visibleCardIds(d.items, d.settings, conn.playerId);
    const cards: Record<string, Card | null> = {};
    const assets: Record<string, AssetMeta> = {};
    const needAsset = (id: string) => {
      const a = d.assets[id];
      if (a && !conn.sentAssets.has(id)) {
        assets[id] = { id: a.id, width: a.width, height: a.height, name: a.name };
        conn.sentAssets.add(id);
      }
    };
    for (const card of Object.values(d.cards)) {
      const v = visible.has(card.id) ? card : redact(card);
      if (conn.sentCards.get(card.id) !== v) {
        cards[card.id] = v;
        conn.sentCards.set(card.id, v);
      }
      needAsset(card.backAssetId);
      if (v.faceAssetId) needAsset(v.faceAssetId);
    }
    for (const id of conn.sentCards.keys()) {
      if (!d.cards[id]) {
        cards[id] = null;
        conn.sentCards.delete(id);
      }
    }
    for (const it of Object.values(d.items)) if (it.kind === 'image') needAsset(it.assetId);
    const out: Patch = {};
    if (Object.keys(cards).length) out.cards = cards;
    if (Object.keys(assets).length) out.assets = assets;
    return out;
  }

  private collectGarbage() {
    const d = this.data;
    const cardIds = new Set<string>();
    const assetIds = new Set<string>();
    for (const it of Object.values(d.items)) {
      if (it.kind === 'card') cardIds.add(it.cardId);
      else if (it.kind === 'deck') it.cardIds.forEach((c) => cardIds.add(c));
      else if (it.kind === 'image') assetIds.add(it.assetId);
    }
    for (const id of Object.keys(d.cards)) {
      if (!cardIds.has(id)) delete d.cards[id];
      else {
        assetIds.add(d.cards[id].faceAssetId);
        assetIds.add(d.cards[id].backAssetId);
      }
    }
    const stale = Date.now() - 10 * 60_000;
    for (const id of Object.keys(d.assets)) {
      if (!assetIds.has(id) && (this.pendingAssets.get(id) ?? 0) < stale) {
        this.pendingAssets.delete(id);
        delete d.assets[id];
        rm(join(this.assetDir, id), { force: true }).catch(() => {});
      }
    }
  }

  send(conn: Connection, msg: ServerMessage) {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(msg));
  }

  broadcast(msg: ServerMessage, except?: Connection) {
    const text = JSON.stringify(msg);
    for (const c of this.connections) {
      if (c !== except && c.socket.readyState === c.socket.OPEN) c.socket.send(text);
    }
  }

  scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.save().catch((e) => console.error('Saving room failed', e)), 1000);
  }

  async save() {
    const dir = join(this.dir, 'rooms');
    await mkdir(dir, { recursive: true });
    const file = join(dir, `${this.data.id}.json`);
    await writeFile(`${file}.tmp`, JSON.stringify(this.data));
    await rename(`${file}.tmp`, file);
  }
}

export class RoomStore {
  private rooms = new Map<string, Room>();
  private loading = new Map<string, Promise<Room | null>>();
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  async create(id: string, settings: Partial<RoomSettings>): Promise<Room> {
    const room = new Room(
      {
        id,
        created: new Date().toISOString(),
        settings: { ...DEFAULT_SETTINGS, ...settings },
        items: {},
        revs: {},
        cards: {},
        assets: {},
        players: {},
      },
      this.dir,
    );
    this.rooms.set(id, room);
    await room.save();
    return room;
  }

  async get(id: string): Promise<Room | null> {
    const cached = this.rooms.get(id);
    if (cached) return cached;
    let p = this.loading.get(id);
    if (!p) {
      p = this.load(id);
      this.loading.set(id, p);
    }
    const room = await p;
    this.loading.delete(id);
    return room;
  }

  private async load(id: string): Promise<Room | null> {
    const file = join(this.dir, 'rooms', `${id}.json`);
    if (!existsSync(file)) return null;
    const room = new Room(JSON.parse(await readFile(file, 'utf8')) as RoomData, this.dir);
    this.rooms.set(id, room);
    return room;
  }

  async saveAll() {
    await Promise.all([...this.rooms.values()].map((r) => r.save()));
  }
}
