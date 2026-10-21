import type { BoardItem, Card, Player, RoomSettings } from '../types.ts';

/** Asset metadata as held by the server; the image itself is fetched by URL. */
export interface AssetMeta {
  id: string;
  width: number;
  height: number;
  name: string;
}

export interface ItemChange {
  item: BoardItem | null;
  /** Client → server: the revision the change was based on. Server → client: the new revision. */
  rev: number;
}

export interface Patch {
  items?: Record<string, ItemChange>;
  cards?: Record<string, Card | null>;
  assets?: Record<string, AssetMeta>;
}

export type ClientMessage =
  | ({ type: 'patch' } & Patch)
  | { type: 'settings'; settings: RoomSettings }
  | { type: 'rename'; name: string; colour: string }
  | { type: 'cursor'; x: number; y: number };

export type ServerMessage =
  | {
      type: 'init';
      roomId: string;
      settings: RoomSettings;
      players: Player[];
      items: Record<string, ItemChange>;
      cards: Record<string, Card>;
      assets: Record<string, AssetMeta>;
    }
  | ({ type: 'patch' } & Patch)
  /** The listed changes were refused; these are the server's current values. */
  | { type: 'reject'; items: Record<string, ItemChange> }
  | { type: 'settings'; settings: RoomSettings }
  | { type: 'players'; players: Player[] }
  | { type: 'cursor'; playerId: string; x: number; y: number };

export const DEFAULT_SETTINGS: RoomSettings = { privateHands: true, hideFaceDown: true };

export const ID_PATTERN = /^[a-z0-9]{4,40}$/;

export function assetUrl(roomId: string, assetId: string) {
  return `/api/rooms/${roomId}/assets/${assetId}`;
}
