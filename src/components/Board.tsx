import { useEffect, useMemo, useRef, useState } from 'react';
import type { Rect } from '../types';
import { containsPoint, intersects, itemBounds, normaliseRect, screenToWorld, zoomAt } from '../lib/geometry';
import { useBoard } from '../store';
import { useUi } from '../ui';
import { ItemView } from './ItemView';
import { SelectionBar } from './SelectionBar';

type Gesture =
  | { type: 'pan'; sx: number; sy: number; camX: number; camY: number }
  | { type: 'marquee'; wx: number; wy: number; base: string[] }
  | {
      type: 'move';
      wx: number;
      wy: number;
      origins: Record<string, { x: number; y: number }>;
      moved: boolean;
      clickedId: string;
      /** Selection to apply if the pointer is released without moving. */
      selectOnClick: string[] | null;
    }
  | { type: 'resize'; id: string; wx: number; wy: number; w: number; h: number };

/** Pointer travel, in screen pixels, before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export function Board() {
  const ref = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const downAt = useRef({ x: 0, y: 0 });
  const spaceHeld = useRef(false);
  const [panning, setPanning] = useState(false);
  const [marquee, setMarquee] = useState<Rect | null>(null);

  const items = useBoard((s) => s.items);
  const camera = useBoard((s) => s.camera);
  const selection = useBoard((s) => s.selection);
  const dragging = useBoard((s) => s.dragging);
  const dropTargetId = useBoard((s) => s.dropTargetId);
  const shufflingId = useBoard((s) => s.shufflingId);

  const sorted = useMemo(() => Object.values(items).sort((a, b) => a.z - b.z), [items]);
  const selectedSet = useMemo(() => new Set(selection), [selection]);
  const draggingSet = useMemo(() => new Set(dragging), [dragging]);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  // Wheel: scroll pans, ctrl/cmd + wheel (and trackpad pinch) zooms.
  useEffect(() => {
    const el = ref.current!;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as HTMLElement).closest('.no-board')) return;
      e.preventDefault();
      const { camera, setCamera } = useBoard.getState();
      if (e.ctrlKey || e.metaKey) {
        const p = local(e);
        setCamera(zoomAt(camera, p.x, p.y, Math.exp(-e.deltaY * 0.01)));
      } else {
        const dx = e.shiftKey && e.deltaX === 0 ? e.deltaY : e.deltaX;
        const dy = e.shiftKey && e.deltaX === 0 ? 0 : e.deltaY;
        setCamera({ ...camera, x: camera.x - dx, y: camera.y - dy });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTyping(e)) {
        spaceHeld.current = true;
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') spaceHeld.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.no-board')) return;
    if (e.button === 2) return;
    const s = useBoard.getState();
    const p = local(e);
    const w = screenToWorld(s.camera, p.x, p.y);
    downAt.current = p;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // Typing into a text label should end when clicking elsewhere.
    (document.activeElement as HTMLElement | null)?.blur();

    if (e.button === 1 || spaceHeld.current) {
      gesture.current = { type: 'pan', sx: p.x, sy: p.y, camX: s.camera.x, camY: s.camera.y };
      setPanning(true);
      return;
    }

    const target = e.target as HTMLElement;
    const itemEl = target.closest<HTMLElement>('[data-item]');
    if (!itemEl) {
      const base = e.shiftKey ? s.selection : [];
      if (!e.shiftKey) s.select([]);
      gesture.current = { type: 'marquee', wx: w.x, wy: w.y, base };
      return;
    }

    let id = itemEl.dataset.item!;
    const item = s.items[id];

    if (target.closest('[data-resize]') && item.kind === 'image') {
      gesture.current = { type: 'resize', id, wx: w.x, wy: w.y, w: item.w, h: item.h };
      return;
    }

    // Alt-drag on a deck pulls its top card off.
    if (e.altKey && item.kind === 'deck') {
      const cardItemId = s.drawCard(id, { at: { x: item.x, y: item.y } });
      if (!cardItemId) return;
      id = cardItemId;
      s.select([id]);
    }

    let selectOnClick: string[] | null = null;
    const current = useBoard.getState().selection;
    if (e.shiftKey) {
      if (current.includes(id)) selectOnClick = current.filter((x) => x !== id);
      else s.select([...current, id]);
    } else if (!current.includes(id)) {
      s.select([id]);
    } else {
      selectOnClick = [id];
    }

    const st = useBoard.getState();
    const origins: Record<string, { x: number; y: number }> = {};
    for (const sid of st.selection.includes(id) ? st.selection : [id]) {
      const it = st.items[sid];
      if (it) origins[sid] = { x: it.x, y: it.y };
    }
    gesture.current = { type: 'move', wx: w.x, wy: w.y, origins, moved: false, clickedId: id, selectOnClick };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const s = useBoard.getState();
    const p = local(e);
    const w = screenToWorld(s.camera, p.x, p.y);

    switch (g.type) {
      case 'pan':
        s.setCamera({ ...s.camera, x: g.camX + p.x - g.sx, y: g.camY + p.y - g.sy });
        break;
      case 'marquee': {
        const r = normaliseRect(g.wx, g.wy, w.x, w.y);
        setMarquee(r);
        const hit = Object.values(s.items)
          .filter((it) => intersects(r, itemBounds(it, s.cards)))
          .map((it) => it.id);
        s.select([...new Set([...g.base, ...hit])]);
        break;
      }
      case 'move': {
        if (!g.moved) {
          if (Math.hypot(p.x - downAt.current.x, p.y - downAt.current.y) < DRAG_THRESHOLD) return;
          g.moved = true;
          s.setDragging(Object.keys(g.origins));
          s.bringToFront(Object.keys(g.origins));
        }
        const dx = w.x - g.wx;
        const dy = w.y - g.wy;
        const pos: Record<string, { x: number; y: number }> = {};
        for (const [id, o] of Object.entries(g.origins)) pos[id] = { x: o.x + dx, y: o.y + dy };
        s.setPositions(pos);
        s.setDropTarget(findDropTarget(Object.keys(g.origins), w.x, w.y));
        break;
      }
      case 'resize': {
        // Keep the image's aspect ratio, driven by the larger pointer movement.
        const k = Math.max(0.05, Math.max((g.w + w.x - g.wx) / g.w, (g.h + w.y - g.wy) / g.h));
        s.resizeImage(g.id, g.w * k, g.h * k);
        break;
      }
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    setPanning(false);
    setMarquee(null);
    if (!g) return;
    const s = useBoard.getState();
    if (g.type === 'move') {
      if (!g.moved) {
        if (g.selectOnClick) s.select(g.selectOnClick);
      } else {
        const target = s.dropTargetId;
        s.setDragging([]);
        s.setDropTarget(null);
        if (target) s.addToDeck(target, Object.keys(g.origins));
      }
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    // Pointer capture retargets clicks to the board, so find what is under the pointer.
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    if (under?.closest('.no-board')) return;
    const itemEl = under?.closest<HTMLElement>('[data-item]');
    if (!itemEl) {
      const s = useBoard.getState();
      const p = local(e);
      const w = screenToWorld(s.camera, p.x, p.y);
      s.addText({ x: w.x - 20, y: w.y - 24 });
      useUi.getState().setEditingText(useBoard.getState().selection[0]);
      return;
    }
    const id = itemEl.dataset.item!;
    const s = useBoard.getState();
    const it = s.items[id];
    if (it.kind === 'card') s.flip([id]);
    else if (it.kind === 'deck') s.drawCard(id, { faceUp: true });
    else if (it.kind === 'text') useUi.getState().setEditingText(id);
  };

  const gridSize = 40 * camera.zoom;
  const cls = ['board'];
  if (panning) cls.push('panning');

  return (
    <div
      ref={ref}
      className={cls.join(' ')}
      style={{
        backgroundSize: `${gridSize}px ${gridSize}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div
        className="world"
        style={{
          transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          ['--zoom' as string]: camera.zoom,
        }}
      >
        {sorted.map((it) => (
          <ItemView
            key={it.id}
            item={it}
            selected={selectedSet.has(it.id)}
            dragging={draggingSet.has(it.id)}
            dropTarget={dropTargetId === it.id}
            shuffling={shufflingId === it.id}
          />
        ))}
        {marquee && (
          <div
            className="marquee"
            style={{ transform: `translate(${marquee.x}px, ${marquee.y}px)`, width: marquee.w, height: marquee.h }}
          />
        )}
      </div>
      {dragging.length === 0 && <SelectionBar />}
      {sorted.length === 0 && (
        <div className="empty-hint">
          <p>Paste, drop or load images to start.</p>
          <p>Select a group of images, then choose “Build deck”.</p>
        </div>
      )}
    </div>
  );
}

/** The topmost deck under the pointer that is not part of the dragged set. */
function findDropTarget(draggedIds: string[], wx: number, wy: number): string | null {
  const s = useBoard.getState();
  const dragged = new Set(draggedIds);
  if (!draggedIds.every((id) => s.items[id]?.kind === 'card' || s.items[id]?.kind === 'deck')) return null;
  let best: { id: string; z: number } | null = null;
  for (const it of Object.values(s.items)) {
    if (it.kind !== 'deck' || dragged.has(it.id)) continue;
    if (containsPoint(itemBounds(it, s.cards), wx, wy) && (!best || it.z > best.z)) best = { id: it.id, z: it.z };
  }
  return best?.id ?? null;
}

export function isTyping(e: Event) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
