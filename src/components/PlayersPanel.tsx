import { useState } from 'react';
import type { CardItem } from '../types';
import { useBoard } from '../store';
import { useSession } from '../sync/session';
import { useUi } from '../ui';

/** Who is in the room, and how many cards each holds. */
export function PlayersPanel() {
  const players = useSession((s) => s.players);
  const me = useSession((s) => s.me.id);
  const settings = useSession((s) => s.settings);
  const items = useBoard((s) => s.items);
  const cards = useBoard((s) => s.cards);
  const assets = useBoard((s) => s.assets);
  const [open, setOpen] = useState<string | null>(null);

  const held: Record<string, CardItem[]> = {};
  for (const it of Object.values(items)) {
    if (it.kind === 'card' && it.holder) (held[it.holder] ??= []).push(it);
  }
  const shown = players.filter((p) => p.online || held[p.id]?.length);

  return (
    <div className="players no-board">
      <div className="players-head">
        Players <span className="muted">· hands {settings.privateHands ? 'private' : 'open'}</span>
      </div>
      {shown.map((p) => {
        const hand = held[p.id] ?? [];
        const canSee = p.id !== me && !settings.privateHands && hand.length > 0;
        return (
          <div key={p.id} className="player">
            <button
              className="player-row"
              onClick={() => {
                if (p.id === me) useUi.getState().openDialog({ type: 'name' });
                else if (canSee) setOpen(open === p.id ? null : p.id);
              }}
              title={p.id === me ? 'Change your name' : canSee ? 'Show hand' : undefined}
            >
              <span className={p.online ? 'dot' : 'dot offline'} style={{ background: p.colour }} />
              <span className="player-name">
                {p.name}
                {p.id === me && <span className="muted"> (you)</span>}
              </span>
              <span className="muted">{hand.length ? `${hand.length} card${hand.length === 1 ? '' : 's'}` : ''}</span>
            </button>
            {open === p.id && canSee && (
              <div className="peek">
                {hand
                  .sort((a, b) => a.z - b.z)
                  .map((it) => {
                    const c = cards[it.cardId];
                    const src = c && !c.hidden ? assets[c.faceAssetId]?.src : undefined;
                    return src ? <img key={it.id} src={src} alt={c.name} title={c.name} /> : null;
                  })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
