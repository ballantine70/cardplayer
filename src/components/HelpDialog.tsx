import { Modal } from './Modal';
import { useSession } from '../sync/session';

const rows: [string, string][] = [
  ['Pan', 'Scroll, or drag with space held / middle mouse button'],
  ['Zoom', 'Ctrl/⌘ + scroll, or pinch on a trackpad'],
  ['Select', 'Click, Shift-click, or drag a box on empty space'],
  ['Add images', 'Paste, drop files onto the board, or “Add images”'],
  ['Build a deck', 'Select images, then “Build deck”'],
  ['Draw a card', 'Double-click a deck, press D, or Alt-drag the deck'],
  ['Return a card', 'Drag it onto a deck'],
  ['Flip', 'Double-click a card, or press F'],
  ['Shuffle', 'Select a deck and press S'],
  ['Add a label', 'Double-click empty space'],
  ['Hand (online)', 'Drag cards into the tray at the bottom; drag them out to play them'],
  ['Details panel', 'Press I, or “Details” in the toolbar'],
  ['Delete', 'Delete or Backspace'],
];

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const inRoom = useSession((s) => s.roomId !== null);
  const shown = rows.filter(([k]) => !(inRoom && k === 'Build a deck'));
  return (
    <Modal title="Controls" onClose={onClose}>
      <dl className="help">
        {shown.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
