import { useState } from 'react';
import type { RoomSettings } from '../types';
import { DEFAULT_SETTINGS } from '../shared/protocol';
import { useBoard } from '../store';
import { sendIdentity, sendSettings } from '../sync/client';
import { PLAYER_COLOURS, saveIdentity, useSession } from '../sync/session';
import { Modal } from './Modal';

function SettingsFields({ value, onChange }: { value: RoomSettings; onChange: (s: RoomSettings) => void }) {
  return (
    <>
      <label className="check">
        <input type="checkbox" checked={value.privateHands} onChange={(e) => onChange({ ...value, privateHands: e.target.checked })} />
        <span>
          Private hands
          <small className="muted block">Only you can see the cards in your hand. Turn off to play with open hands.</small>
        </span>
      </label>
      <label className="check">
        <input type="checkbox" checked={value.hideFaceDown} onChange={(e) => onChange({ ...value, hideFaceDown: e.target.checked })} />
        <span>
          Hide face-down cards
          <small className="muted block">
            Nobody can look up face-down cards or the order of a deck. Turn off while building or checking decks.
          </small>
        </span>
      </label>
    </>
  );
}

export function OnlineDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
  const hasBoard = useBoard((s) => Object.keys(s.items).length > 0);
  const [bring, setBring] = useState(hasBoard);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      if (!res.ok) throw new Error(`The server said ${res.status}.`);
      const { id } = (await res.json()) as { id: string };
      location.assign(`/r/${id}${bring ? '?seed=1' : ''}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reach the server.');
      setBusy(false);
    }
  }

  return (
    <Modal title="Play online" onClose={onClose}>
      <div className="form">
        <p className="muted">Creates a room with its own link. Anyone with the link can join and play on the same board.</p>
        <SettingsFields value={settings} onChange={setSettings} />
        <label className="check">
          <input type="checkbox" checked={bring} disabled={!hasBoard} onChange={(e) => setBring(e.target.checked)} />
          Copy this board into the room
        </label>
      </div>
      <footer>
        {error && <span className="error">{error}</span>}
        <button onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={create}>
          {busy ? 'Creating…' : 'Create room'}
        </button>
      </footer>
    </Modal>
  );
}

export function RoomSettingsDialog({ onClose }: { onClose: () => void }) {
  const current = useSession((s) => s.settings);
  const [settings, setSettings] = useState(current);
  return (
    <Modal title="Room settings" onClose={onClose}>
      <div className="form">
        <SettingsFields value={settings} onChange={setSettings} />
        <p className="muted">Changes apply to everyone in the room.</p>
      </div>
      <footer>
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          onClick={() => {
            sendSettings(settings);
            onClose();
          }}
        >
          Save
        </button>
      </footer>
    </Modal>
  );
}

export function NameDialog({ onClose }: { onClose: () => void }) {
  const me = useSession((s) => s.me);
  const [name, setName] = useState(me.named ? me.name : '');
  const [colour, setColour] = useState(me.colour);
  const save = () => {
    const next = { ...me, name: name.trim() || 'Player', colour, named: true };
    saveIdentity(next);
    useSession.setState({ me: next });
    sendIdentity(next.name, next.colour);
    onClose();
  };
  return (
    <Modal title="Your name" onClose={save}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <label className="field">
          <span>Name shown to other players</span>
          <input autoFocus value={name} maxLength={40} placeholder="Player" onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="colours" role="radiogroup" aria-label="Colour">
          {PLAYER_COLOURS.map((c) => (
            <button
              type="button"
              key={c}
              role="radio"
              aria-checked={c === colour}
              aria-label={c}
              className={c === colour ? 'swatch chosen' : 'swatch'}
              style={{ background: c }}
              onClick={() => setColour(c)}
            />
          ))}
        </div>
      </form>
      <footer>
        <button className="primary" onClick={save}>
          Done
        </button>
      </footer>
    </Modal>
  );
}
