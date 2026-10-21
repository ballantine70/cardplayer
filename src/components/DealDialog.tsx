import { useState } from 'react';
import { useBoard } from '../store';
import { useSession } from '../sync/session';
import { Modal } from './Modal';

export function DealDialog({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const deck = useBoard((s) => s.items[deckId]);
  const dealDeck = useBoard((s) => s.dealDeck);
  const [players, setPlayers] = useState(2);
  const [all, setAll] = useState(false);
  const [perPlayer, setPerPlayer] = useState(5);
  const [faceUp, setFaceUp] = useState(false);
  const inRoom = useSession((s) => s.roomId !== null);
  const allPlayers = useSession((s) => s.players);
  const online = allPlayers.filter((p) => p.online);
  const [toHands, setToHands] = useState(inRoom);
  if (deck?.kind !== 'deck') return null;
  const handsMode = inRoom && toHands && online.length > 0;
  const seats = handsMode ? online.length : players;
  const count = deck.cardIds.length;
  const dealt = all ? count : Math.min(count, seats * perPlayer);

  return (
    <Modal title={`Deal ${deck.name}`} onClose={onClose}>
      <div className="form">
        {inRoom && (
          <>
            <label className="radio">
              <input type="radio" checked={toHands} onChange={() => setToHands(true)} />
              <span>
                Into players’ hands
                <small className="muted block">{online.map((p) => p.name).join(', ')}</small>
              </span>
            </label>
            <label className="radio">
              <input type="radio" checked={!toHands} onChange={() => setToHands(false)} />
              Onto the table in rows
            </label>
          </>
        )}
        {!handsMode && (
          <label className="field inline">
            <span>Players</span>
            <input type="number" min={1} max={12} value={players} onChange={(e) => setPlayers(clamp(+e.target.value, 1, 12))} />
          </label>
        )}
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
        {!handsMode && (
          <label className="check">
            <input type="checkbox" checked={faceUp} onChange={(e) => setFaceUp(e.target.checked)} />
            Deal face up
          </label>
        )}
        <p className="muted">
          Deals {dealt} of {count} cards one at a time from the top, leaving {count - dealt} in the deck.
        </p>
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            dealDeck(deckId, {
              players,
              perPlayer: all ? null : perPlayer,
              faceUp,
              hands: handsMode ? online.map((p) => p.id) : undefined,
            });
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
