import { useEffect, useState } from 'react';
import type { DeckItem } from '../types';
import { libraryAssetUrl, type LibrarySummary } from '../shared/library';
import {
  addDecksToRoom,
  deleteLibraryDeck,
  getLibraryDeck,
  listLibrary,
  renameLibraryDeck,
  saveDeckToLibrary,
} from '../lib/libraryApi';
import { viewportCentre } from '../lib/view';
import { useBoard } from '../store';
import { useSession } from '../sync/session';
import { Modal } from './Modal';

/** Load the library list, with a way to refresh it. */
function useLibrary() {
  const [decks, setDecks] = useState<LibrarySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    listLibrary()
      .then((d) => {
        setDecks(d);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    refresh();
  }, []);
  return { decks, error, refresh };
}

function Cover({ deck }: { deck: LibrarySummary }) {
  return deck.coverAssetId ? <img className="lib-cover" src={libraryAssetUrl(deck.coverAssetId)} alt="" /> : <div className="lib-cover" />;
}

const plural = (n: number) => `${n} card${n === 1 ? '' : 's'}`;

/** Tick boxes for choosing library decks, used when creating or adding to a table. */
export function DeckPicker({ chosen, onChange }: { chosen: string[]; onChange: (ids: string[]) => void }) {
  const { decks, error } = useLibrary();
  if (error) return <p className="error">{error}</p>;
  if (!decks) return <p className="muted">Loading the library…</p>;
  if (decks.length === 0) return <p className="muted">The library is empty. Select a deck on your board and choose “Save to library”.</p>;
  return (
    <div className="lib-list">
      {decks.map((d) => (
        <label key={d.id} className="lib-row check">
          <input
            type="checkbox"
            checked={chosen.includes(d.id)}
            onChange={(e) => onChange(e.target.checked ? [...chosen, d.id] : chosen.filter((id) => id !== d.id))}
          />
          <Cover deck={d} />
          <span className="lib-name">{d.name}</span>
          <span className="muted">{plural(d.cardCount)}</span>
        </label>
      ))}
    </div>
  );
}

/** The library: browse saved decks; put them on the board, or on the current table. */
export function LibraryDialog({ onClose }: { onClose: () => void }) {
  const roomId = useSession((s) => s.roomId);
  return roomId ? <AddToTable roomId={roomId} onClose={onClose} /> : <ManageLibrary onClose={onClose} />;
}

function AddToTable({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [chosen, setChosen] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal title="Add decks to this table" onClose={onClose}>
      <div className="form">
        <p className="muted">Copies are placed face down beside what is already on the table.</p>
        <DeckPicker chosen={chosen} onChange={setChosen} />
      </div>
      <footer>
        {error && <span className="error">{error}</span>}
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={busy || chosen.length === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await addDecksToRoom(roomId, chosen);
              onClose();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {chosen.length > 1 ? `Add ${chosen.length} decks` : 'Add deck'}
        </button>
      </footer>
    </Modal>
  );
}

function ManageLibrary({ onClose }: { onClose: () => void }) {
  const { decks, error, refresh } = useLibrary();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const act = async (id: string, fn: () => Promise<unknown>) => {
    setBusy(id);
    setProblem(null);
    try {
      await fn();
    } catch (e) {
      setProblem((e as Error).message);
    }
    setBusy(null);
  };

  return (
    <Modal title="Deck library" onClose={onClose}>
      <div className="form">
        {(error || problem) && <p className="error">{error ?? problem}</p>}
        {!decks && !error && <p className="muted">Loading the library…</p>}
        {decks?.length === 0 && <p className="muted">No saved decks yet. Select a deck on the board and choose “Save to library”.</p>}
        <div className="lib-list">
          {decks?.map((d) => (
            <div key={d.id} className="lib-row">
              <Cover deck={d} />
              {renaming === d.id ? (
                <form
                  className="lib-name"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const name = new FormData(e.currentTarget).get('name') as string;
                    setRenaming(null);
                    act(d.id, () => renameLibraryDeck(d.id, name).then(refresh));
                  }}
                >
                  <input name="name" defaultValue={d.name} autoFocus onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
                </form>
              ) : (
                <span className="lib-name">
                  {d.name}
                  <small className="muted block">{plural(d.cardCount)}</small>
                </span>
              )}
              <div className="lib-actions">
                <button
                  disabled={busy === d.id}
                  onClick={() =>
                    act(d.id, async () => {
                      const deck = await getLibraryDeck(d.id);
                      useBoard.getState().placeLibraryDeck(deck, viewportCentre());
                      onClose();
                    })
                  }
                >
                  Put on board
                </button>
                <button disabled={busy === d.id} onClick={() => setRenaming(d.id)}>
                  Rename
                </button>
                <button
                  disabled={busy === d.id}
                  onClick={() => {
                    if (confirm(`Delete “${d.name}” from the library? Tables already using it keep their copy.`))
                      act(d.id, () => deleteLibraryDeck(d.id).then(refresh));
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
      <footer>
        <button onClick={onClose}>Close</button>
      </footer>
    </Modal>
  );
}

export function SaveDeckDialog({ deckId, onClose }: { deckId: string; onClose: () => void }) {
  const deck = useBoard((s) => s.items[deckId]) as DeckItem | undefined;
  const outOfDeck = useBoard((s) =>
    deck ? Object.values(s.items).filter((it) => it.kind === 'card' && s.cards[it.cardId]?.homeDeckId === deck.id).length : 0,
  );
  const { decks } = useLibrary();
  const saved = deck?.libraryId ? decks?.find((d) => d.id === deck.libraryId) : undefined;
  const [name, setName] = useState(deck?.name ?? '');
  const [mode, setMode] = useState<'update' | 'new'>('update');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!deck) return null;
  const replace = saved && mode === 'update' ? saved.id : null;

  return (
    <Modal title="Save to library" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>Name in the library</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {saved && (
          <>
            <label className="radio">
              <input type="radio" checked={mode === 'update'} onChange={() => setMode('update')} />
              <span>
                Update “{saved.name}”
                <small className="muted block">Replaces the saved copy. Tables already using it are not changed.</small>
              </span>
            </label>
            <label className="radio">
              <input type="radio" checked={mode === 'new'} onChange={() => setMode('new')} />
              Save as a new deck
            </label>
          </>
        )}
        <p className="muted">Saves the {plural(deck.cardIds.length)} in the deck, in their current order, with their names, values and descriptions.</p>
        {outOfDeck > 0 && (
          <p className="warning">
            {plural(outOfDeck)} from this deck {outOfDeck === 1 ? 'is' : 'are'} out on the board and won’t be saved. Use Gather first to include{' '}
            {outOfDeck === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>
      <footer>
        {error && <span className="error">{error}</span>}
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={busy || !name.trim() || deck.cardIds.length === 0}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await saveDeckToLibrary(deckId, name.trim(), replace);
              onClose();
            } catch (e) {
              setError((e as Error).message);
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : replace ? 'Update' : 'Save'}
        </button>
      </footer>
    </Modal>
  );
}
