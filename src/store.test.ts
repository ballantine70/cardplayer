import { beforeEach, describe, expect, it } from 'vitest';
import { useBoard, type NewCard } from './store';
import type { CardItem, DeckItem } from './types';

const asset = (name: string) => ({ src: `data:${name}`, width: 10, height: 14, name });
const newCard = (name: string): NewCard => ({ face: asset(name), width: 250, height: 350, name, value: '', description: '' });

function makeDeck(names: string[]) {
  return useBoard.getState().createDeck({
    name: 'Test',
    cards: names.map(newCard),
    back: asset('back'),
    x: 0,
    y: 0,
    removeItemIds: [],
  });
}

const s = () => useBoard.getState();
const deck = (id: string) => s().items[id] as DeckItem;
const cardName = (cardId: string) => s().cards[cardId].name;
const looseCards = () => Object.values(s().items).filter((i): i is CardItem => i.kind === 'card');

beforeEach(() => s().clearBoard());

describe('board store', () => {
  it('builds a face-down deck with the first card on top', () => {
    const id = makeDeck(['one', 'two', 'three']);
    const d = deck(id);
    expect(d.faceUp).toBe(false);
    expect(d.cardIds.map(cardName)).toEqual(['three', 'two', 'one']);
    expect(Object.keys(s().assets)).toHaveLength(4);
  });

  it('removes source images when building', () => {
    s().addImages([asset('a')], { x: 0, y: 0 });
    const imageId = s().selection[0];
    s().createDeck({ name: 'D', cards: [newCard('a')], back: asset('b'), x: 0, y: 0, removeItemIds: [imageId] });
    expect(s().items[imageId]).toBeUndefined();
  });

  it('draws the top card and keeps an emptied deck as a slot', () => {
    const id = makeDeck(['one', 'two']);
    s().drawCard(id, { faceUp: true });
    expect(looseCards().map((c) => cardName(c.cardId))).toEqual(['one']);
    expect(looseCards()[0].faceUp).toBe(true);
    s().drawCard(id);
    expect(deck(id).cardIds).toEqual([]);
    expect(deck(id).cardWidth).toBe(250);
    expect(looseCards()).toHaveLength(2);
    expect(s().drawCard(id)).toBeNull();
  });

  it('flipping a deck reverses its order', () => {
    const id = makeDeck(['one', 'two', 'three']);
    s().flip([id]);
    expect(deck(id).faceUp).toBe(true);
    expect(deck(id).cardIds.map(cardName)).toEqual(['one', 'two', 'three']);
  });

  it('deals hands and labels players', () => {
    const id = makeDeck(['a', 'b', 'c', 'd', 'e']);
    s().dealDeck(id, { players: 2, perPlayer: 2, faceUp: false });
    expect(looseCards()).toHaveLength(4);
    expect(deck(id).cardIds).toHaveLength(1);
    const labels = Object.values(s().items).filter((i) => i.kind === 'text');
    expect(labels).toHaveLength(2);
  });

  it('spreads a deck beside its slot and gathers it back', () => {
    const id = makeDeck(['a', 'b', 'c']);
    s().spreadDeck(id);
    expect(deck(id).cardIds).toEqual([]);
    expect(looseCards().every((c) => c.x > deck(id).x)).toBe(true);
    s().gatherDeck(id);
    expect(deck(id).cardIds).toHaveLength(3);
  });

  it('continues along each row when dealing again', () => {
    const id = makeDeck(['a', 'b', 'c', 'd', 'e', 'f']);
    s().dealDeck(id, { players: 2, perPlayer: 1, faceUp: false });
    s().dealDeck(id, { players: 2, perPlayer: 2, faceUp: false });
    const rows = new Map<number, number[]>();
    for (const c of looseCards()) rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
    expect(rows.size).toBe(2);
    for (const xs of rows.values()) {
      expect(xs).toHaveLength(3);
      expect(new Set(xs).size).toBe(3);
    }
  });

  it('gathers loose cards back into their home deck', () => {
    const id = makeDeck(['a', 'b', 'c']);
    s().drawCard(id, { faceUp: true });
    s().drawCard(id, { faceUp: true });
    s().gatherDeck(id);
    expect(looseCards()).toHaveLength(0);
    expect(deck(id).cardIds).toHaveLength(3);
    expect(deck(id).faceUp).toBe(false);
  });

  it('adds dropped cards to the top of a deck', () => {
    const id = makeDeck(['a', 'b']);
    const cardItem = s().drawCard(id)!;
    s().addToDeck(id, [cardItem]);
    expect(deck(id).cardIds.map(cardName)).toEqual(['b', 'a']);
  });

  it('stacks loose cards into a new deck', () => {
    const id = makeDeck(['a', 'b']);
    const c1 = s().drawCard(id)!;
    const c2 = s().drawCard(id)!;
    const stackId = s().stackIntoDeck([c1, c2])!;
    expect(deck(stackId).cardIds).toHaveLength(2);
    expect(looseCards()).toHaveLength(0);
  });

  it('drops cards and assets when their deck is deleted', () => {
    const id = makeDeck(['a', 'b']);
    s().deleteItems([id]);
    expect(Object.keys(s().cards)).toHaveLength(0);
    expect(Object.keys(s().assets)).toHaveLength(0);
  });

  it('updates card metadata', () => {
    const id = makeDeck(['a']);
    const cardId = deck(id).cardIds[0];
    s().updateCard(cardId, { value: '10', description: 'Ten' });
    expect(s().cards[cardId]).toMatchObject({ name: 'a', value: '10', description: 'Ten' });
  });
});
