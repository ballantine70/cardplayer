import type { BoardItem, Camera, Card, Rect } from '../types';

export function screenToWorld(cam: Camera, sx: number, sy: number) {
  return { x: (sx - cam.x) / cam.zoom, y: (sy - cam.y) / cam.zoom };
}

export function worldToScreen(cam: Camera, wx: number, wy: number) {
  return { x: wx * cam.zoom + cam.x, y: wy * cam.zoom + cam.y };
}

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

/** Zoom by `factor`, keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(cam: Camera, sx: number, sy: number, factor: number): Camera {
  const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.zoom * factor));
  const k = zoom / cam.zoom;
  return { zoom, x: sx - (sx - cam.x) * k, y: sy - (sy - cam.y) * k };
}

export function normaliseRect(x1: number, y1: number, x2: number, y2: number): Rect {
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

export function containsPoint(r: Rect, x: number, y: number) {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

export const TEXT_SIZE = { w: 220, h: 48 };
export const DEFAULT_CARD = { w: 250, h: 350 };

export function itemBounds(item: BoardItem, cards: Record<string, Card>): Rect {
  switch (item.kind) {
    case 'image':
      return { x: item.x, y: item.y, w: item.w, h: item.h };
    case 'card': {
      const c = cards[item.cardId];
      return { x: item.x, y: item.y, w: c?.width ?? DEFAULT_CARD.w, h: c?.height ?? DEFAULT_CARD.h };
    }
    case 'deck': {
      const top = cards[item.cardIds[item.cardIds.length - 1]];
      return {
        x: item.x,
        y: item.y,
        w: top?.width ?? item.cardWidth ?? DEFAULT_CARD.w,
        h: top?.height ?? item.cardHeight ?? DEFAULT_CARD.h,
      };
    }
    case 'text':
      return { x: item.x, y: item.y, ...TEXT_SIZE };
  }
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

/**
 * Move `want` right until it overlaps none of `taken`, so new objects do not
 * land on top of existing ones.
 */
export function findFreeSpot(want: Rect, taken: Rect[], gap: number): { x: number; y: number } {
  const r = { ...want };
  for (let guard = 0; guard < 1000; guard++) {
    const padded = { x: r.x - gap, y: r.y - gap, w: r.w + gap * 2, h: r.h + gap * 2 };
    const hit = taken.filter((t) => intersects(padded, t));
    if (hit.length === 0) break;
    r.x = Math.max(...hit.map((t) => t.x + t.w)) + gap;
  }
  return { x: r.x, y: r.y };
}
