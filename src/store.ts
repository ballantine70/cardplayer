import { create } from 'zustand';
import type { Asset, BoardData, BoardItem, Camera, Card, CardItem, DeckItem, ImageItem, TextItem } from './types';
import { DEFAULT_CARD, findFreeSpot, itemBounds, unionRects } from './lib/geometry';
import { planDeal, shuffle } from './lib/deckOps';
import { libraryAssetUrl, type LibraryDeck } from './shared/library';

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** A card prepared for a new deck, before ids are assigned. */
export interface NewCard {
  face: Omit<Asset, 'id'>;
  /** This card's own back; without it the deck's shared back is used. */
  back?: Omit<Asset, 'id'>;
  width: number;
  height: number;
  name: string;
  value: string;
  description: string;
}

export interface NewDeck {
  name: string;
  cards: NewCard[];
  back: Omit<Asset, 'id'>;
  x: number;
  y: number;
  /** Board items to remove once the deck exists (usually the source images). */
  removeItemIds: string[];
}

export interface DealOptions {
  players: number;
  perPlayer: number | null;
  faceUp: boolean;
  /** Deal into these players' hands instead of rows on the table. */
  hands?: string[];
}

/** Changes received from the server; null removes the entry. */
export interface RemoteChanges {
  items?: Record<string, BoardItem | null>;
  cards?: Record<string, Card | null>;
  assets?: Record<string, Asset>;
}

interface State extends Omit<BoardData, 'version'> {
  selection: string[];
  /** Ids currently being dragged; their transitions are disabled. */
  dragging: string[];
  /** Deck highlighted as a drop target during a drag. */
  dropTargetId: string | null;
  /** Deck playing its shuffle animation. */
  shufflingId: string | null;
}

interface Actions {
  setCamera(cam: Camera): void;
  select(ids: string[]): void;
  setDragging(ids: string[]): void;
  setDropTarget(id: string | null): void;
  addImages(images: Omit<Asset, 'id'>[], at: { x: number; y: number }): void;
  addText(at: { x: number; y: number }, text?: string): void;
  setPositions(pos: Record<string, { x: number; y: number }>): void;
  bringToFront(ids: string[]): void;
  resizeImage(id: string, w: number, h: number): void;
  deleteItems(ids: string[]): void;
  updateCard(id: string, patch: Partial<Pick<Card, 'name' | 'value' | 'description'>>): void;
  updateItem(id: string, patch: Partial<Pick<DeckItem, 'name' | 'libraryId'>> | Partial<Pick<TextItem, 'text'>>): void;
  /** Put a copy of a library deck on the board, face down, near `at`; returns the deck's id. */
  placeLibraryDeck(deck: LibraryDeck, at: { x: number; y: number }): string;
  createDeck(deck: NewDeck): string;
  shuffleDeck(id: string): void;
  flip(ids: string[]): void;
  /** Take the top card off a deck as a loose card item; returns its item id. */
  drawCard(deckId: string, opts?: { faceUp?: boolean; at?: { x: number; y: number } }): string | null;
  dealDeck(deckId: string, opts: DealOptions): void;
  spreadDeck(deckId: string): void;
  /** Lay loose cards out in a grid with gaps, keeping their facing. */
  spreadCards(itemIds: string[]): void;
  gatherDeck(deckId: string): void;
  /** Put cards (and the contents of decks) on top of a deck. */
  addToDeck(deckId: string, itemIds: string[]): void;
  /** Stack selected cards and decks into a new deck. */
  stackIntoDeck(itemIds: string[]): string | null;
  /** Move cards into a player's hand. */
  takeIntoHand(itemIds: string[], playerId: string): void;
  /** Put a card from a hand onto the table. */
  playFromHand(itemId: string, at: { x: number; y: number }, faceUp?: boolean): void;
  applyRemote(changes: RemoteChanges): void;
  loadBoard(data: BoardData): void;
  clearBoard(): void;
}

export type Store = State & Actions;

export const initialCamera: Camera = { x: 0, y: 0, zoom: 1 };

const emptyState = (): State => ({
  assets: {},
  cards: {},
  items: {},
  camera: { ...initialCamera },
  selection: [],
  dragging: [],
  dropTargetId: null,
  shufflingId: null,
});

const maxZ = (items: Record<string, BoardItem>) =>
  Object.values(items).reduce((m, it) => Math.max(m, it.z), 0);

/** Remove cards and assets no longer referenced by any board item. */
function collectGarbage(s: Pick<State, 'items' | 'cards' | 'assets'>) {
  const cardIds = new Set<string>();
  const assetIds = new Set<string>();
  for (const it of Object.values(s.items)) {
    if (it.kind === 'card') cardIds.add(it.cardId);
    else if (it.kind === 'deck') it.cardIds.forEach((c) => cardIds.add(c));
    else if (it.kind === 'image') assetIds.add(it.assetId);
  }
  const cards: Record<string, Card> = {};
  for (const id of cardIds) {
    const c = s.cards[id];
    if (!c) continue;
    cards[id] = c;
    assetIds.add(c.faceAssetId);
    assetIds.add(c.backAssetId);
  }
  const assets: Record<string, Asset> = {};
  for (const id of assetIds) if (s.assets[id]) assets[id] = s.assets[id];
  return { cards, assets };
}

/** Largest dimension a newly added image is shown at, in world units. */
const IMAGE_MAX = 300;

export const useBoard = create<Store>()((set, get) => ({
  ...emptyState(),

  setCamera: (camera) => set({ camera }),
  select: (selection) => set({ selection }),
  setDragging: (dragging) => set({ dragging }),
  setDropTarget: (dropTargetId) => set({ dropTargetId }),

  addImages(images, at) {
    const s = get();
    const assets = { ...s.assets };
    const items = { ...s.items };
    let z = maxZ(items);
    const gap = 24;
    const perRow = Math.max(1, Math.ceil(Math.sqrt(images.length)));
    // Lay the images out in a grid relative to (0, 0), then move the grid somewhere free.
    const placed: { img: Omit<Asset, 'id'>; x: number; y: number; w: number; h: number }[] = [];
    let x = 0;
    let y = 0;
    let rowH = 0;
    images.forEach((img, i) => {
      const scale = Math.min(1, IMAGE_MAX / Math.max(img.width, img.height));
      const w = img.width * scale;
      const h = img.height * scale;
      if (i > 0 && i % perRow === 0) {
        x = 0;
        y += rowH + gap;
        rowH = 0;
      }
      placed.push({ img, x, y, w, h });
      x += w + gap;
      rowH = Math.max(rowH, h);
    });
    const block = unionRects(placed)!;
    const origin = findFreeSpot(
      { x: at.x - block.w / 2, y: at.y - block.h / 2, w: block.w, h: block.h },
      Object.values(items).filter(onTable).map((it) => itemBounds(it, s.cards)),
      gap,
    );
    const ids = placed.map((p) => {
      const assetId = uid();
      assets[assetId] = { ...p.img, id: assetId };
      const id = uid();
      items[id] = { kind: 'image', id, assetId, x: origin.x + p.x, y: origin.y + p.y, w: p.w, h: p.h, z: ++z };
      return id;
    });
    set({ assets, items, selection: ids });
  },

  addText(at, text = 'Label') {
    const items = { ...get().items };
    const id = uid();
    items[id] = { kind: 'text', id, x: at.x, y: at.y, z: maxZ(items) + 1, text };
    set({ items, selection: [id] });
  },

  setPositions(pos) {
    const items = { ...get().items };
    for (const [id, p] of Object.entries(pos)) {
      if (items[id]) items[id] = { ...items[id], x: p.x, y: p.y };
    }
    set({ items });
  },

  bringToFront(ids) {
    const items = { ...get().items };
    let z = maxZ(items);
    const ordered = ids.filter((id) => items[id]).sort((a, b) => items[a].z - items[b].z);
    for (const id of ordered) items[id] = { ...items[id], z: ++z };
    set({ items });
  },

  resizeImage(id, w, h) {
    const it = get().items[id];
    if (it?.kind !== 'image') return;
    set({ items: { ...get().items, [id]: { ...it, w, h } } });
  },

  deleteItems(ids) {
    const s = get();
    const items = { ...s.items };
    ids.forEach((id) => delete items[id]);
    set({
      items,
      ...collectGarbage({ ...s, items }),
      selection: s.selection.filter((id) => items[id]),
    });
  },

  updateCard(id, patch) {
    const c = get().cards[id];
    if (c) set({ cards: { ...get().cards, [id]: { ...c, ...patch } } });
  },

  updateItem(id, patch) {
    const it = get().items[id];
    if (it) set({ items: { ...get().items, [id]: { ...it, ...patch } as BoardItem } });
  },

  createDeck(nd) {
    const s = get();
    const assets = { ...s.assets };
    const cards = { ...s.cards };
    const items = { ...s.items };
    const deckId = uid();
    const backId = uid();
    assets[backId] = { ...nd.back, id: backId };
    const cardIds = nd.cards.map((nc) => {
      const faceId = uid();
      assets[faceId] = { ...nc.face, id: faceId };
      let cardBackId = backId;
      if (nc.back) {
        cardBackId = uid();
        assets[cardBackId] = { ...nc.back, id: cardBackId };
      }
      const id = uid();
      cards[id] = {
        id,
        faceAssetId: faceId,
        backAssetId: cardBackId,
        width: nc.width,
        height: nc.height,
        name: nc.name,
        value: nc.value,
        description: nc.description,
        homeDeckId: deckId,
      };
      return id;
    });
    nd.removeItemIds.forEach((id) => delete items[id]);
    // Start where the source images were, but keep clear of anything left there.
    const w = nd.cards[0]?.width ?? DEFAULT_CARD.w;
    const h = nd.cards[0]?.height ?? DEFAULT_CARD.h;
    const spot = findFreeSpot(
      { x: nd.x, y: nd.y, w, h },
      Object.values(items).filter(onTable).map((it) => itemBounds(it, cards)),
      40,
    );
    // The first card in the dialog ends up on top of the deck.
    items[deckId] = {
      kind: 'deck',
      id: deckId,
      name: nd.name,
      x: spot.x,
      y: spot.y,
      z: maxZ(items) + 1,
      cardIds: cardIds.reverse(),
      faceUp: false,
      cardWidth: nd.cards[0]?.width,
      cardHeight: nd.cards[0]?.height,
    };
    set({ items, ...collectGarbage({ items, cards, assets }), selection: [deckId] });
    return deckId;
  },

  placeLibraryDeck(lib, at) {
    const s = get();
    const assets = { ...s.assets };
    const cards = { ...s.cards };
    const items = { ...s.items };
    for (const a of Object.values(lib.assets)) assets[a.id] ??= { ...a, src: libraryAssetUrl(a.id) };
    const deckId = uid();
    const cardIds = lib.cards
      .map((c) => {
        const id = uid();
        cards[id] = { id, ...c, homeDeckId: deckId };
        return id;
      })
      .reverse();
    const w = lib.cards[0]?.width ?? DEFAULT_CARD.w;
    const h = lib.cards[0]?.height ?? DEFAULT_CARD.h;
    const spot = findFreeSpot(
      { x: at.x - w / 2, y: at.y - h / 2, w, h },
      Object.values(items).filter(onTable).map((it) => itemBounds(it, cards)),
      60,
    );
    items[deckId] = {
      kind: 'deck',
      id: deckId,
      name: lib.name,
      x: spot.x,
      y: spot.y,
      z: maxZ(items) + 1,
      cardIds,
      faceUp: false,
      cardWidth: w,
      cardHeight: h,
      libraryId: lib.id,
    };
    set({ assets, cards, items, selection: [deckId] });
    return deckId;
  },

  shuffleDeck(id) {
    const deck = get().items[id];
    if (deck?.kind !== 'deck') return;
    set({
      items: { ...get().items, [id]: { ...deck, cardIds: shuffle(deck.cardIds) } },
      shufflingId: id,
    });
    setTimeout(() => {
      if (get().shufflingId === id) set({ shufflingId: null });
    }, 500);
  },

  flip(ids) {
    const items = { ...get().items };
    for (const id of ids) {
      const it = items[id];
      if (it?.kind === 'card') items[id] = { ...it, faceUp: !it.faceUp };
      // Turning a deck over reverses its order as well as its facing.
      else if (it?.kind === 'deck')
        items[id] = { ...it, faceUp: !it.faceUp, cardIds: it.cardIds.slice().reverse() };
    }
    set({ items });
  },

  drawCard(deckId, opts = {}) {
    const s = get();
    const deck = s.items[deckId];
    if (deck?.kind !== 'deck' || deck.cardIds.length === 0) return null;
    const items = { ...s.items };
    const cardIds = deck.cardIds.slice();
    const cardId = cardIds.pop()!;
    const card = s.cards[cardId];
    const id = uid();
    const at = opts.at ?? { x: deck.x + card.width + 50, y: deck.y };
    items[id] = {
      kind: 'card',
      id,
      cardId,
      x: at.x,
      y: at.y,
      z: maxZ(items) + 1,
      faceUp: opts.faceUp ?? deck.faceUp,
    };
    // An emptied deck stays as a slot on the table.
    items[deckId] = { ...deck, cardIds, cardWidth: card.width, cardHeight: card.height };
    set({ items, selection: s.selection.filter((sid) => items[sid]) });
    return id;
  },

  dealDeck(deckId, { players, perPlayer, faceUp, hands }) {
    const s = get();
    const deck = s.items[deckId];
    if (deck?.kind !== 'deck') return;
    const seats = hands?.length ? hands.length : players;
    const plan = planDeal(deck.cardIds, seats, perPlayer);
    const items = { ...s.items };
    let z = maxZ(items);
    const { w, h } = itemBounds(deck, s.cards);
    // Leave room for the deck's mat and label.
    const top = deck.y + h + 110;
    const overlap = w * 0.4;
    const texts = Object.values(items).filter((it): it is TextItem => it.kind === 'text');
    plan.hands.forEach((hand, p) => {
      if (hands?.length) {
        hand.forEach((cardId) => {
          const id = uid();
          items[id] = { kind: 'card', id, cardId, x: 0, y: 0, z: ++z, faceUp: true, holder: hands[p] };
        });
        return;
      }
      const rowY = top + p * (h + 60);
      const labelX = deck.x - 260;
      const label = `Player ${p + 1}`;
      if (players > 1 && !texts.some((t) => t.text === label && t.x === labelX && t.y === rowY)) {
        const lid = uid();
        items[lid] = { kind: 'text', id: lid, text: label, x: labelX, y: rowY, z: ++z };
      }
      // Carry on after any cards already lying in this player's row.
      const inRow = Object.values(items).filter(
        (it) => it.kind === 'card' && !it.holder && Math.abs(it.y - rowY) < 1 && it.x >= deck.x - 1,
      );
      const startX = inRow.length ? Math.max(...inRow.map((it) => it.x)) + overlap : deck.x;
      hand.forEach((cardId, i) => {
        const id = uid();
        items[id] = { kind: 'card', id, cardId, x: startX + i * overlap, y: rowY, z: ++z, faceUp };
      });
    });
    items[deckId] = { ...deck, cardIds: plan.remaining, cardWidth: w, cardHeight: h };
    set({ items, selection: s.selection.filter((id) => items[id]) });
  },

  spreadCards(itemIds) {
    const s = get();
    const chosen = itemIds
      .map((id) => s.items[id])
      .filter((it): it is CardItem => it?.kind === 'card' && !it.holder);
    if (chosen.length < 2) return;
    // Rows top to bottom, then left to right; within a pile, the top card first.
    const ordered = chosen.slice().sort((a, b) => Math.round(a.y) - Math.round(b.y) || Math.round(a.x) - Math.round(b.x) || b.z - a.z);
    const bounds = ordered.map((it) => itemBounds(it, s.cards));
    const cellW = Math.max(...bounds.map((r) => r.w));
    const cellH = Math.max(...bounds.map((r) => r.h));
    const gap = 30;
    const perRow = Math.max(1, Math.min(ordered.length, Math.ceil(Math.sqrt(ordered.length * 2))));
    const rows = Math.ceil(ordered.length / perRow);
    const start = unionRects(bounds)!;
    const block = { x: start.x, y: start.y, w: perRow * (cellW + gap) - gap, h: rows * (cellH + gap) - gap };
    const chosenIds = new Set(ordered.map((it) => it.id));
    const origin = findFreeSpot(
      block,
      Object.values(s.items)
        .filter((it) => onTable(it) && !chosenIds.has(it.id))
        .map((it) => itemBounds(it, s.cards)),
      gap,
    );
    const pos: Record<string, { x: number; y: number }> = {};
    ordered.forEach((it, i) => {
      pos[it.id] = { x: origin.x + (i % perRow) * (cellW + gap), y: origin.y + Math.floor(i / perRow) * (cellH + gap) };
    });
    get().setPositions(pos);
  },

  spreadDeck(deckId) {
    const s = get();
    const deck = s.items[deckId];
    if (deck?.kind !== 'deck') return;
    const items = { ...s.items };
    let z = maxZ(items);
    const { w, h } = itemBounds(deck, s.cards);
    const perRow = Math.max(1, Math.ceil(Math.sqrt(deck.cardIds.length * 1.5)));
    const ids: string[] = [];
    // Top card first, in reading order.
    deck.cardIds
      .slice()
      .reverse()
      .forEach((cardId, i) => {
        const id = uid();
        items[id] = {
          kind: 'card',
          id,
          cardId,
          x: deck.x + w + 60 + (i % perRow) * (w + 20),
          y: deck.y + Math.floor(i / perRow) * (h + 20),
          z: ++z,
          faceUp: true,
        };
        ids.push(id);
      });
    items[deckId] = { ...deck, cardIds: [], cardWidth: w, cardHeight: h };
    set({ items, selection: ids });
  },

  gatherDeck(deckId) {
    const s = get();
    const deck = s.items[deckId];
    if (deck?.kind !== 'deck') return;
    const items = { ...s.items };
    const gathered: string[] = [];
    for (const it of Object.values(items)) {
      if (it.kind === 'card' && s.cards[it.cardId]?.homeDeckId === deck.id) {
        gathered.push(it.cardId);
        delete items[it.id];
      }
    }
    items[deckId] = { ...deck, cardIds: [...gathered, ...deck.cardIds], faceUp: false };
    set({ items, selection: [deckId] });
  },

  addToDeck(deckId, itemIds) {
    const s = get();
    const deck = s.items[deckId];
    if (deck?.kind !== 'deck') return;
    const items = { ...s.items };
    const cardIds = deck.cardIds.slice();
    const sources = itemIds
      .map((id) => items[id])
      .filter((it): it is CardItem | DeckItem => !!it && it.id !== deckId && (it.kind === 'card' || it.kind === 'deck'))
      .sort((a, b) => a.z - b.z);
    for (const it of sources) {
      if (it.kind === 'card') cardIds.push(it.cardId);
      else cardIds.push(...it.cardIds);
      delete items[it.id];
    }
    items[deckId] = { ...deck, cardIds };
    set({ items, selection: [deckId] });
  },

  stackIntoDeck(itemIds) {
    const s = get();
    const sources = itemIds
      .map((id) => s.items[id])
      .filter((it): it is CardItem | DeckItem => !!it && (it.kind === 'card' || it.kind === 'deck'))
      .sort((a, b) => a.z - b.z);
    if (sources.length === 0) return null;
    const items = { ...s.items };
    const bottom = sources[0];
    const cardIds: string[] = [];
    for (const it of sources) {
      if (it.kind === 'card') cardIds.push(it.cardId);
      else cardIds.push(...it.cardIds);
      delete items[it.id];
    }
    const top = sources[sources.length - 1];
    const id = uid();
    items[id] = {
      kind: 'deck',
      id,
      name: bottom.kind === 'deck' ? bottom.name : 'Stack',
      x: bottom.x,
      y: bottom.y,
      z: maxZ(items) + 1,
      cardIds,
      faceUp: top.faceUp,
      cardWidth: s.cards[cardIds[0]]?.width,
      cardHeight: s.cards[cardIds[0]]?.height,
    };
    set({ items, selection: [id] });
    return id;
  },

  takeIntoHand(itemIds, playerId) {
    const items = { ...get().items };
    let z = maxZ(items);
    for (const id of itemIds) {
      const it = items[id];
      if (it?.kind === 'card') items[id] = { ...it, holder: playerId, faceUp: true, z: ++z };
    }
    set({ items, selection: get().selection.filter((id) => !itemIds.includes(id)) });
  },

  playFromHand(itemId, at, faceUp = true) {
    const it = get().items[itemId];
    if (it?.kind !== 'card') return;
    const { holder: _, ...rest } = it;
    set({ items: { ...get().items, [itemId]: { ...rest, x: at.x, y: at.y, faceUp, z: maxZ(get().items) + 1 } } });
  },

  applyRemote({ items: itemChanges, cards: cardChanges, assets: assetChanges }) {
    const s = get();
    const patch: Partial<State> = {};
    if (itemChanges) {
      const items = { ...s.items };
      for (const [id, it] of Object.entries(itemChanges)) {
        if (it) items[id] = it;
        else delete items[id];
      }
      patch.items = items;
      patch.selection = s.selection.filter((id) => items[id]);
      patch.dragging = s.dragging.filter((id) => items[id]);
    }
    if (cardChanges) {
      const cards = { ...s.cards };
      for (const [id, c] of Object.entries(cardChanges)) {
        if (c) cards[id] = c;
        else delete cards[id];
      }
      patch.cards = cards;
    }
    if (assetChanges) patch.assets = { ...s.assets, ...assetChanges };
    set(patch);
  },

  loadBoard(data) {
    set({ ...emptyState(), assets: data.assets, cards: data.cards, items: data.items, camera: data.camera });
  },

  clearBoard() {
    set({ ...emptyState(), camera: get().camera });
  },
}));

export function boardData(s: Store = useBoard.getState()): BoardData {
  return { version: 1, assets: s.assets, cards: s.cards, items: s.items, camera: s.camera };
}

export function selectionBounds(s: Store) {
  return unionRects(
    s.selection
      .map((id) => s.items[id])
      .filter((it) => it && onTable(it))
      .map((it) => itemBounds(it, s.cards)),
  );
}

/** False for cards held in a player's hand. */
export function onTable(it: BoardItem): boolean {
  return !(it.kind === 'card' && it.holder);
}

export function isImage(it: BoardItem | undefined): it is ImageItem {
  return it?.kind === 'image';
}

export { DEFAULT_CARD };
