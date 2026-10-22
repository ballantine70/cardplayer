import { create } from 'zustand';
import type { Player, RoomSettings } from '../types';
import { DEFAULT_SETTINGS } from '../shared/protocol';
import { uid } from '../store';

export type Status = 'connecting' | 'online' | 'reconnecting' | 'missing';

interface Identity {
  id: string;
  name: string;
  colour: string;
  /** False until the player has chosen a name. */
  named: boolean;
}

export const PLAYER_COLOURS = ['#2f5d8a', '#b3261e', '#2e7d4f', '#8e44ad', '#c76b00', '#00838f', '#ad1457', '#5d6d1e'];

const KEY = 'cardplayer.player';

function loadIdentity(): Identity {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Identity;
      if (p.id && p.name) return p;
    }
  } catch {
    // Storage unavailable: use a fresh identity for this visit.
  }
  return {
    id: uid(),
    name: 'Player',
    colour: PLAYER_COLOURS[Math.floor(Math.random() * PLAYER_COLOURS.length)],
    named: false,
  };
}

export function saveIdentity(p: Identity) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not fatal; the name just will not be remembered.
  }
}

interface Session {
  /** Null on the local, single-player board. */
  roomId: string | null;
  me: Identity;
  status: Status;
  players: Player[];
  settings: RoomSettings;
  /** May use the deck-building board. Assumed until the server says otherwise. */
  admin: boolean;
  cursors: Record<string, { x: number; y: number; at: number }>;
}

export const useSession = create<Session>()(() => ({
  roomId: null,
  me: loadIdentity(),
  status: 'connecting',
  players: [],
  settings: DEFAULT_SETTINGS,
  admin: true,
  cursors: {},
}));

export function roomIdFromPath(pathname = location.pathname): string | null {
  const m = /^\/r\/([a-z0-9]{4,40})\/?$/.exec(pathname);
  return m ? m[1] : null;
}

/** Ask the server whether this browser is logged in as an admin. */
export async function loadRole() {
  try {
    const res = await fetch('/api/me');
    if (res.ok) useSession.setState({ admin: ((await res.json()) as { admin: boolean }).admin });
  } catch {
    // No server (e.g. the plain dev server): keep the default.
  }
}
