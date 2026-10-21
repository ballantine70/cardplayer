import { describe, expect, it } from 'vitest';
import { findFreeSpot, screenToWorld, worldToScreen, zoomAt } from './geometry';

describe('camera', () => {
  it('round-trips screen and world coordinates', () => {
    const cam = { x: 120, y: -40, zoom: 2.5 };
    const w = screenToWorld(cam, 300, 200);
    expect(worldToScreen(cam, w.x, w.y)).toEqual({ x: 300, y: 200 });
  });
  it('keeps the point under the cursor fixed when zooming', () => {
    const cam = { x: 10, y: 20, zoom: 1 };
    const before = screenToWorld(cam, 400, 300);
    const after = screenToWorld(zoomAt(cam, 400, 300, 1.7), 400, 300);
    expect(after.x).toBeCloseTo(before.x);
    expect(after.y).toBeCloseTo(before.y);
  });
});

describe('findFreeSpot', () => {
  it('returns the requested spot when it is free', () => {
    expect(findFreeSpot({ x: 0, y: 0, w: 10, h: 10 }, [{ x: 100, y: 0, w: 10, h: 10 }], 5)).toEqual({ x: 0, y: 0 });
  });
  it('moves past overlapping objects', () => {
    const taken = [
      { x: 0, y: 0, w: 50, h: 50 },
      { x: 60, y: 0, w: 50, h: 50 },
    ];
    expect(findFreeSpot({ x: 10, y: 10, w: 20, h: 20 }, taken, 5)).toEqual({ x: 115, y: 10 });
  });
});
