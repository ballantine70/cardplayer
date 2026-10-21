import { useMemo } from 'react';
import type { CardItem } from '../types';
import { useBoard } from '../store';
import { useSession } from '../sync/session';
import { CardFace } from './ItemView';

const HAND_HEIGHT = 120;

/** The current player's hand, docked along the bottom of the board. */
export function HandTray({ highlight }: { highlight: boolean }) {
  const items = useBoard((s) => s.items);
  const cards = useBoard((s) => s.cards);
  const selection = useBoard((s) => s.selection);
  const me = useSession((s) => s.me.id);
  const hand = useMemo(
    () =>
      Object.values(items)
        .filter((it): it is CardItem => it.kind === 'card' && it.holder === me)
        .sort((a, b) => a.z - b.z),
    [items, me],
  );

  return (
    <div className={highlight ? 'hand-tray highlight' : 'hand-tray'}>
      <div className="hand-label">Your hand{hand.length ? ` · ${hand.length}` : ''}</div>
      {hand.length === 0 ? (
        <p className="muted hand-empty">Drag cards here to take them into your hand.</p>
      ) : (
        <div className="hand-cards">
          {hand.map((it) => {
            const card = cards[it.cardId];
            if (!card) return null;
            const k = HAND_HEIGHT / card.height;
            return (
              <div
                key={it.id}
                className={selection.includes(it.id) ? 'hand-card selected' : 'hand-card'}
                data-hand-card={it.id}
                style={{ width: card.width * k, height: HAND_HEIGHT }}
              >
                <div style={{ transform: `scale(${k})`, transformOrigin: '0 0' }}>
                  <CardFace cardId={it.cardId} faceUp />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
