import { useState } from 'react';
import { useBoard } from '../store';
import { Modal } from './Modal';

export function DealDialog({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const deck = useBoard((s) => s.items[deckId]);
  const dealDeck = useBoard((s) => s.dealDeck);
  const [players, setPlayers] = useState(2);
  const [all, setAll] = useState(false);
  const [perPlayer, setPerPlayer] = useState(5);
  const [faceUp, setFaceUp] = useState(false);
  if (deck?.kind !== 'deck') return null;
  const count = deck.cardIds.length;
  const dealt = all ? count : Math.min(count, players * perPlayer);

  return (
    <Modal title={`Deal ${deck.name}`} onClose={onClose}>
      <div className="form">
        <label className="field inline">
          <span>Players</span>
          <input type="number" min={1} max={12} value={players} onChange={(e) => setPlayers(clamp(+e.target.value, 1, 12))} />
        </label>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          Deal out the whole deck
        </label>
        {!all && (
          <label className="field inline">
            <span>Cards each</span>
            <input type="number" min={1} max={count} value={perPlayer} onChange={(e) => setPerPlayer(clamp(+e.target.value, 1, count))} />
          </label>
        )}
        <label className="check">
          <input type="checkbox" checked={faceUp} onChange={(e) => setFaceUp(e.target.checked)} />
          Deal face up
        </label>
        <p className="muted">
          Deals {dealt} of {count} cards one at a time from the top, leaving {count - dealt} in the deck.
        </p>
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            dealDeck(deckId, { players, perPlayer: all ? null : perPlayer, faceUp });
            onClose();
          }}
        >
          Deal
        </button>
      </footer>
    </Modal>
  );
}

const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo);
