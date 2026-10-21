// @vitest-environment node
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { Card, CardItem, DeckItem } from '../src/types.ts';
import type { ServerMessage } from '../src/shared/protocol.ts';
import { Room, type Connection } from './rooms.ts';

function fakeConn(playerId: string) {
  const inbox: ServerMessage[] = [];
  const socket = { OPEN: 1, readyState: 1, send: (t: string) => inbox.push(JSON.parse(t)) } as unknown as WebSocket;
  const conn: Connection = { socket, playerId, sentCards: new Map(), sentAssets: new Set() };
  return { conn, inbox };
}

function makeRoom(settings = { privateHands: true, hideFaceDown: true }) {
  const dir = mkdtempSync(join(tmpdir(), 'cardplayer-'));
  return new Room({ id: 'room1', created: '', settings, items: {}, revs: {}, cards: {}, assets: {}, players: {} }, dir);
}

const card = (id: string, name: string): Card => ({
  id,
  faceAssetId: `face${id}`,
  backAssetId: 'back',
  width: 250,
  height: 350,
  name,
  value: '',
  description: '',
  homeDeckId: 'deck1',
});

const deck = (cardIds: string[], faceUp = false): DeckItem => ({ kind: 'deck', id: 'deck1', name: 'D', x: 0, y: 0, z: 1, cardIds, faceUp });

/** The latest version of each card a connection has been sent. */
function cardsSeen(inbox: ServerMessage[]) {
  const out: Record<string, Card | null> = {};
  for (const m of inbox) {
    if (m.type === 'init') Object.assign(out, m.cards);
    if (m.type === 'patch' && m.cards) Object.assign(out, m.cards);
  }
  return out;
}

function setup(settings?: { privateHands: boolean; hideFaceDown: boolean }) {
  const room = makeRoom(settings);
  const a = fakeConn('alice');
  const b = fakeConn('bob');
  room.join(a.conn, 'Alice', '#2f5d8a');
  room.join(b.conn, 'Bob', '#b3261e');
  room.applyPatch(a.conn, {
    items: { deck1: { item: deck(['c1', 'c2']), rev: 0 } },
    cards: { c1: card('c1', 'Ace'), c2: card('c2', 'King') },
  });
  return { room, a, b };
}

describe('Room', () => {
  it('hides a face-down deck from other players', () => {
    const { b } = setup();
    const seen = cardsSeen(b.inbox);
    expect(seen.c1?.hidden).toBe(true);
    expect(seen.c1?.name).toBe('');
    expect(seen.c1?.faceAssetId).toBe('');
  });

  it('shows everything when face-down cards are not hidden', () => {
    const { b } = setup({ privateHands: true, hideFaceDown: false });
    expect(cardsSeen(b.inbox).c2?.name).toBe('King');
  });

  it('reveals a card when it is turned face up', () => {
    const { room, a, b } = setup();
    const cardItem: CardItem = { kind: 'card', id: 'i1', cardId: 'c2', x: 0, y: 0, z: 2, faceUp: true };
    room.applyPatch(a.conn, {
      items: { deck1: { item: deck(['c1']), rev: 1 }, i1: { item: cardItem, rev: 0 } },
    });
    expect(cardsSeen(b.inbox).c2?.name).toBe('King');
    expect(cardsSeen(b.inbox).c1?.hidden).toBe(true);
  });

  it('keeps private hands private, and open hands open', () => {
    const { room, a, b } = setup();
    const held: CardItem = { kind: 'card', id: 'i1', cardId: 'c2', x: 0, y: 0, z: 2, faceUp: true, holder: 'alice' };
    room.applyPatch(a.conn, { items: { deck1: { item: deck(['c1']), rev: 1 }, i1: { item: held, rev: 0 } } });
    expect(cardsSeen(a.inbox).c2?.name).toBe('King');
    expect(cardsSeen(b.inbox).c2?.hidden).toBe(true);

    room.setSettings({ privateHands: false, hideFaceDown: true });
    expect(cardsSeen(b.inbox).c2?.name).toBe('King');
  });

  it('rejects a change based on an out-of-date revision', () => {
    const { room, a, b } = setup();
    room.applyPatch(a.conn, { items: { deck1: { item: deck(['c1']), rev: 1 } } });
    // Bob still thinks the deck is at revision 1.
    room.applyPatch(b.conn, { items: { deck1: { item: deck([]), rev: 1 } } });
    const reject = b.inbox.find((m) => m.type === 'reject');
    expect(reject).toBeDefined();
    expect((room.data.items.deck1 as DeckItem).cardIds).toEqual(['c1']);
  });

  it('ignores edits to cards the sender cannot see', () => {
    const { room, b } = setup();
    room.applyPatch(b.conn, { cards: { c1: { ...card('c1', 'Forged') } } });
    expect(room.data.cards.c1.name).toBe('Ace');
  });

  it('drops cards that are no longer on the board', () => {
    const { room, a } = setup();
    room.applyPatch(a.conn, { items: { deck1: { item: null, rev: 1 } } });
    expect(room.data.cards).toEqual({});
  });
});
