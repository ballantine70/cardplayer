import type { DeckItem } from '../types';
import type { LibraryCard, LibraryDeck, LibrarySummary } from '../shared/library';
import { useBoard } from '../store';

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `The server said ${res.status}.`);
  return body as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

export async function listLibrary(): Promise<LibrarySummary[]> {
  return (await call<{ decks: LibrarySummary[] }>('/api/library')).decks;
}

export const getLibraryDeck = (id: string) => call<LibraryDeck>(`/api/library/decks/${id}`);
export const renameLibraryDeck = (id: string, name: string) => call(`/api/library/decks/${id}`, jsonInit('PATCH', { name }));
export const deleteLibraryDeck = (id: string) => call(`/api/library/decks/${id}`, { method: 'DELETE' });
export const addDecksToRoom = (roomId: string, deckIds: string[]) => call(`/api/rooms/${roomId}/decks`, jsonInit('POST', { deckIds }));

/**
 * Save a deck from the board to the library, uploading any images the
 * library does not already hold. With `replaceId`, the saved copy is updated.
 */
export async function saveDeckToLibrary(deckItemId: string, name: string, replaceId: string | null): Promise<string> {
  const s = useBoard.getState();
  const deck = s.items[deckItemId] as DeckItem;
  const cards = deck.cardIds
    .slice()
    .reverse()
    .map((id) => s.cards[id])
    .filter(Boolean);
  const assetIds = [...new Set(cards.flatMap((c) => [c.faceAssetId, c.backAssetId]))];
  for (const id of assetIds) {
    const a = s.assets[id];
    if (!a || a.src.startsWith('/api/library/')) continue;
    const blob = await (await fetch(a.src)).blob();
    await call(`/api/library/assets/${id}`, { method: 'PUT', body: blob, headers: { 'content-type': blob.type || 'image/png' } });
  }
  const body = {
    name,
    cards: cards.map(
      (c): LibraryCard => ({
        name: c.name,
        value: c.value,
        description: c.description,
        faceAssetId: c.faceAssetId,
        backAssetId: c.backAssetId,
        width: c.width,
        height: c.height,
      }),
    ),
    assets: Object.fromEntries(
      assetIds.map((id) => [id, { id, width: s.assets[id]?.width ?? 0, height: s.assets[id]?.height ?? 0, name: s.assets[id]?.name ?? '' }]),
    ),
  };
  const { id } = replaceId
    ? await call<{ id: string }>(`/api/library/decks/${replaceId}`, jsonInit('PUT', body))
    : await call<{ id: string }>('/api/library/decks', jsonInit('POST', body));
  useBoard.getState().updateItem(deckItemId, { libraryId: id, name });
  return id;
}
