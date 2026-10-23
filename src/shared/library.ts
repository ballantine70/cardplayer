/** A card as stored in the deck library. */
export interface LibraryCard {
  name: string;
  value: string;
  description: string;
  faceAssetId: string;
  backAssetId: string;
  width: number;
  height: number;
}

export interface LibraryAsset {
  id: string;
  width: number;
  height: number;
  name: string;
}

export interface LibraryDeck {
  id: string;
  name: string;
  savedAt: string;
  /** Top of the deck first. */
  cards: LibraryCard[];
  assets: Record<string, LibraryAsset>;
}

export interface LibrarySummary {
  id: string;
  name: string;
  savedAt: string;
  cardCount: number;
  /** Face of the top card, for a thumbnail. */
  coverAssetId: string | null;
}

export const libraryAssetUrl = (assetId: string) => `/api/library/assets/${assetId}`;
