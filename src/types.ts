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
  /** Set when the server withheld this card's face and details from this player. */
  hidden?: boolean;
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
  /** Player whose hand the card is in; absent when it is on the table. */
  holder?: string;
}

export interface DeckItem extends ItemBase {
  kind: 'deck';
  name: string;
  /** Bottom of the deck first; the last entry is the top card. */
  cardIds: string[];
  faceUp: boolean;
  /** Card size, so the deck keeps its place on the table when empty. */
  cardWidth?: number;
  cardHeight?: number;
  /** The library deck this was saved as or placed from. */
  libraryId?: string;
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

export interface RoomSettings {
  /** Only a hand's holder can see its cards. */
  privateHands: boolean;
  /** Nobody can see face-down cards on the table or the order of a deck. */
  hideFaceDown: boolean;
}

export interface Player {
  id: string;
  name: string;
  colour: string;
  online: boolean;
}
