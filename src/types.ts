/** A stored image (board image, card face or card back). */
export interface Asset {
  id: string;
  src: string;
  width: number;
  height: number;
  name: string;
}

export interface Card {
  id: string;
  faceAssetId: string;
  backAssetId: string;
  /** Size of the card on the board, in world units. */
  width: number;
  height: number;
  name: string;
  value: string;
  description: string;
  /** The deck the card was created in, used to gather cards back. */
  homeDeckId: string;
}

interface ItemBase {
  id: string;
  x: number;
  y: number;
  z: number;
}

export interface ImageItem extends ItemBase {
  kind: 'image';
  assetId: string;
  w: number;
  h: number;
}

export interface CardItem extends ItemBase {
  kind: 'card';
  cardId: string;
  faceUp: boolean;
}

export interface DeckItem extends ItemBase {
  kind: 'deck';
  name: string;
  /** Bottom of the deck first; the last entry is the top card. */
  cardIds: string[];
  faceUp: boolean;
}

export interface TextItem extends ItemBase {
  kind: 'text';
  text: string;
}

export type BoardItem = ImageItem | CardItem | DeckItem | TextItem;

export interface Camera {
  /** Screen offset of the world origin, in pixels. */
  x: number;
  y: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BoardData {
  version: 1;
  assets: Record<string, Asset>;
  cards: Record<string, Card>;
  items: Record<string, BoardItem>;
  camera: Camera;
}
