import { describe, expect, it } from 'vitest';
import { fitOnCard, isUniform, planDeal, readingOrder, shuffle } from './deckOps';

describe('shuffle', () => {
  it('keeps every element and does not mutate the input', () => {
    const input = Array.from({ length: 52 }, (_, i) => i);
    const out = shuffle(input);
    expect(out).toHaveLength(52);
    expect(out.slice().sort((a, b) => a - b)).toEqual(input);
    expect(input[0]).toBe(0);
  });
});

describe('isUniform', () => {
  it('accepts images sharing an aspect ratio', () => {
    expect(isUniform([{ width: 500, height: 700 }, { width: 250, height: 350 }])).toBe(true);
  });
  it('rejects mixed shapes and empty input', () => {
    expect(isUniform([{ width: 500, height: 700 }, { width: 700, height: 500 }])).toBe(false);
    expect(isUniform([])).toBe(false);
  });
});

describe('fitOnCard', () => {
  it('centres a wide image within the padded card', () => {
    const p = fitOnCard(400, 200, 250, 350, 0.1);
    expect(p.rotate).toBe(false);
    expect(p.w).toBeCloseTo(200);
    expect(p.h).toBeCloseTo(100);
    expect(p.x).toBeCloseTo(25);
    expect(p.y).toBeCloseTo(125);
  });
  it('rotates a wide image only when allowed and larger', () => {
    expect(fitOnCard(400, 200, 250, 350, 0, true).rotate).toBe(true);
    expect(fitOnCard(200, 400, 250, 350, 0, true).rotate).toBe(false);
  });
});

describe('planDeal', () => {
  it('deals round-robin from the top of the deck', () => {
    // 'f' is the top card.
    const plan = planDeal(['a', 'b', 'c', 'd', 'e', 'f'], 2, 2);
    expect(plan.hands).toEqual([['f', 'd'], ['e', 'c']]);
    expect(plan.remaining).toEqual(['a', 'b']);
  });
  it('deals the whole deck when perPlayer is null', () => {
    const plan = planDeal(['a', 'b', 'c'], 2, null);
    expect(plan.hands).toEqual([['c', 'a'], ['b']]);
    expect(plan.remaining).toEqual([]);
  });
  it('stops when the deck runs out', () => {
    expect(planDeal(['a'], 3, 5).hands).toEqual([['a'], [], []]);
  });
});

describe('readingOrder', () => {
  it('orders by rows then columns', () => {
    const items = [
      { id: 'c', x: 0, y: 200, h: 100 },
      { id: 'b', x: 150, y: 10, h: 100 },
      { id: 'a', x: 0, y: 0, h: 100 },
    ];
    expect(readingOrder(items).map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
});
