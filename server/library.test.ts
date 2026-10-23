// @vitest-environment node
import { existsSync, mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { WebSocket } from 'ws';
import type { DeckItem } from '../src/types.ts';
import type { ServerMessage } from '../src/shared/protocol.ts';
import { Library } from './library.ts';
import { Room, type Connection } from './rooms.ts';

const png = Buffer.from('fake image');
const card = (name: string, face: string) => ({ name, value: '1', description: '', faceAssetId: face, backAssetId: 'back0001', width: 250, height: 350 });

async function makeLibrary() {
  const dir = mkdtempSync(join(tmpdir(), 'cardplayer-lib-'));
  const lib = new Library(dir);
  await lib.load();
  for (const id of ['face0001', 'face0002', 'back0001']) await lib.putAsset(id, 'image/png', png);
  return { lib, dir };
}

describe('Library', () => {
  it('saves, lists, renames and reloads decks', async () => {
    const { lib, dir } = await makeLibrary();
    const deck = await lib.save('deck0001', { name: 'Animals', cards: [card('Cat', 'face0001'), card('Dog', 'face0002')], assets: {} });
    expect(typeof deck).not.toBe('string');
    expect(lib.list()).toEqual([expect.objectContaining({ id: 'deck0001', name: 'Animals', cardCount: 2, coverAssetId: 'face0001' })]);
    await lib.rename('deck0001', 'Pets');
    const again = new Library(dir);
    await again.load();
    expect(again.get('deck0001')?.name).toBe('Pets');
    expect(again.get('deck0001')?.cards.map((c) => c.name)).toEqual(['Cat', 'Dog']);
  });

  it('refuses decks whose images were not uploaded', async () => {
    const { lib } = await makeLibrary();
    expect(await lib.save('deck0002', { name: 'X', cards: [card('Cat', 'missing1')] })).toMatch(/not been uploaded/);
  });

  it('removes images no deck uses once a deck is deleted', async () => {
    const { lib, dir } = await makeLibrary();
    await lib.save('deck0001', { name: 'A', cards: [card('Cat', 'face0001')] });
    // Simulate the upload grace period having passed.
    (lib as unknown as { pending: Map<string, number> }).pending.clear();
    await lib.remove('deck0001');
    expect(readdirSync(join(dir, 'library', 'assets'))).toEqual([]);
  });
});

describe('Room.addDecks', () => {
  it('copies a library deck onto the table, face down and hidden from players', async () => {
    const { lib, dir } = await makeLibrary();
    const saved = await lib.save('deck0001', { name: 'Animals', cards: [card('Cat', 'face0001'), card('Dog', 'face0002')] });
    if (typeof saved === 'string') throw new Error(saved);
    const room = new Room({ id: 'room0001', created: '', settings: { privateHands: true, hideFaceDown: true }, items: {}, revs: {}, cards: {}, assets: {}, players: {} }, dir);
    const inbox: ServerMessage[] = [];
    const socket = { OPEN: 1, readyState: 1, send: (t: string) => inbox.push(JSON.parse(t)) } as unknown as WebSocket;
    const conn: Connection = { socket, playerId: 'bob00001', admin: false, sentCards: new Map(), sentAssets: new Set() };
    room.join(conn, 'Bob', '#2f5d8a');

    const [deckId] = await room.addDecks([saved], (id) => lib.assetPath(id), (id) => lib.mime(id));
    const deck = room.data.items[deckId] as DeckItem;
    expect(deck.faceUp).toBe(false);
    // The library's first card is the top of the deck.
    expect(room.data.cards[deck.cardIds[deck.cardIds.length - 1]].name).toBe('Cat');
    expect(existsSync(join(room.assetDir, 'face0001'))).toBe(true);
    const sentCards = inbox.flatMap((m) => (m.type === 'patch' && m.cards ? Object.values(m.cards) : []));
    expect(sentCards.length).toBe(2);
    expect(sentCards.every((c) => c?.hidden)).toBe(true);

    // A second deck goes to the right of the first.
    const [second] = await room.addDecks([saved], (id) => lib.assetPath(id), (id) => lib.mime(id));
    expect(room.data.items[second].x).toBeGreaterThan(deck.x);
  });
});
