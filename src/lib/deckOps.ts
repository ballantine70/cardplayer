import type { Asset } from '../types';

/** Fisher–Yates shuffle; returns a new array. */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * True when every image has the same aspect ratio (within `tolerance`), so the
 * images can be used directly as card faces.
 */
export function isUniform(assets: Pick<Asset, 'width' | 'height'>[], tolerance = 0.01): boolean {
  if (assets.length === 0) return false;
  const ref = assets[0].width / assets[0].height;
  return assets.every((a) => Math.abs(a.width / a.height - ref) / ref <= tolerance);
}

export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: boolean;
}

/**
 * Fit an image of size (iw, ih) inside a card of size (cw, ch) with `padding`
 * (fraction of the card's shorter side) on every edge, preserving aspect ratio.
 * If `allowRotate`, a quarter turn is used when it lets the image appear larger.
 * Returned w/h are the drawn size before rotation.
 */
export function fitOnCard(
  iw: number,
  ih: number,
  cw: number,
  ch: number,
  padding: number,
  allowRotate = false,
): Placement {
  const pad = Math.min(cw, ch) * padding;
  const aw = cw - 2 * pad;
  const ah = ch - 2 * pad;
  const scale = Math.min(aw / iw, ah / ih);
  const rotScale = Math.min(aw / ih, ah / iw);
  const rotate = allowRotate && rotScale > scale * 1.05;
  const s = rotate ? rotScale : scale;
  const w = iw * s;
  const h = ih * s;
  const bw = rotate ? h : w;
  const bh = rotate ? w : h;
  return { x: (cw - bw) / 2, y: (ch - bh) / 2, w, h, rotate };
}

/** Sort objects into reading order: top-to-bottom rows, then left-to-right. */
export function readingOrder<T extends { x: number; y: number; h: number }>(items: T[]): T[] {
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  const rows: T[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    // Same row when its vertical centre falls within the first item of the row.
    if (row && it.y + it.h / 2 < row[0].y + row[0].h) row.push(it);
    else rows.push([it]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.x - b.x));
}

export interface DealPlan {
  /** For each player, the card ids dealt to them in order. */
  hands: string[][];
  /** Card ids left in the deck, bottom first. */
  remaining: string[];
}

/**
 * Deal round-robin from the top of the deck (the end of `cardIds`).
 * `perPlayer` of null deals out the whole deck.
 */
export function planDeal(cardIds: readonly string[], players: number, perPlayer: number | null): DealPlan {
  const stack = cardIds.slice();
  const hands: string[][] = Array.from({ length: players }, () => []);
  const total = perPlayer === null ? stack.length : Math.min(stack.length, perPlayer * players);
  for (let i = 0; i < total; i++) {
    hands[i % players].push(stack.pop()!);
  }
  return { hands, remaining: stack };
}

export function fileBaseName(name: string): string {
  return name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}
