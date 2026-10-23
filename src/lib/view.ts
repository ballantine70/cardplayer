import { itemBounds, screenToWorld, unionRects, zoomAt } from './geometry';
import { useBoard } from '../store';

export function boardSize() {
  const el = document.querySelector('.board');
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: window.innerWidth, h: window.innerHeight };
}

export function viewportCentre() {
  const { w, h } = boardSize();
  return screenToWorld(useBoard.getState().camera, w / 2, h / 2);
}

export function zoomBy(factor: number) {
  const { w, h } = boardSize();
  const s = useBoard.getState();
  s.setCamera(zoomAt(s.camera, w / 2, h / 2, factor));
}

/** Fit every object on the board into view. */
export function zoomToFit() {
  const s = useBoard.getState();
  const b = unionRects(Object.values(s.items).map((it) => itemBounds(it, s.cards)));
  const size = boardSize();
  // Keep clear of the hand tray docked along the bottom of a table.
  const tray = document.querySelector('.hand-tray')?.clientHeight ?? 0;
  const w = size.w;
  const h = size.h - (tray ? tray + 12 : 0);
  if (!b) return s.setCamera({ x: w / 2, y: h / 2, zoom: 1 });
  // Extra room below for deck labels.
  const margin = 80;
  const zoom = Math.min(1, Math.max(0.05, Math.min((w - margin * 2) / b.w, (h - margin * 2) / (b.h + 60))));
  s.setCamera({ zoom, x: w / 2 - (b.x + b.w / 2) * zoom, y: h / 2 - (b.y + (b.h + 60) / 2) * zoom });
}
