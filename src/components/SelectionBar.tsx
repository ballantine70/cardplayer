import { selectionBounds, useBoard } from '../store';
import { worldToScreen } from '../lib/geometry';
import { useUi } from '../ui';
import { useSession } from '../sync/session';

/** Contextual actions shown above the current selection. */
export function SelectionBar() {
  const s = useBoard();
  const openDialog = useUi((u) => u.openDialog);
  // Decks are built on the admin board, never on a shared table.
  const canBuild = useSession((u) => u.roomId === null);
  const bounds = selectionBounds(s);
  if (!bounds) return null;

  const selected = s.selection.map((id) => s.items[id]).filter(Boolean);
  const images = selected.filter((it) => it.kind === 'image');
  const cards = selected.filter((it) => it.kind === 'card');
  const decks = selected.filter((it) => it.kind === 'deck');
  const deck = selected.length === 1 && decks.length === 1 ? decks[0] : null;

  const p = worldToScreen(s.camera, bounds.x + bounds.w / 2, bounds.y);
  const style = { left: p.x, top: Math.max(8, p.y - 52) };

  const buttons: { label: string; title?: string; onClick: () => void; primary?: boolean }[] = [];
  if (images.length > 0 && canBuild) {
    buttons.push({
      label: `Build deck (${images.length})`,
      primary: true,
      onClick: () => openDialog({ type: 'build', itemIds: images.map((i) => i.id) }),
    });
  }
  if (deck?.kind === 'deck' && deck.cardIds.length === 0) {
    buttons.push({ label: 'Gather', title: 'Return this deck’s loose cards and turn it face down', onClick: () => s.gatherDeck(deck.id) });
  } else if (deck?.kind === 'deck') {
    buttons.push(
      { label: 'Shuffle', title: 'Shuffle (S)', onClick: () => s.shuffleDeck(deck.id) },
      { label: 'Draw', title: 'Draw the top card face up (D)', onClick: () => s.drawCard(deck.id, { faceUp: true }) },
      { label: 'Deal…', onClick: () => openDialog({ type: 'deal', deckId: deck.id }) },
      { label: 'Flip', title: 'Turn the deck over (F)', onClick: () => s.flip([deck.id]) },
      { label: 'Spread', title: 'Lay every card out face up', onClick: () => s.spreadDeck(deck.id) },
      { label: 'Gather', title: 'Return this deck’s loose cards and turn it face down', onClick: () => s.gatherDeck(deck.id) },
    );
    if (canBuild) {
      buttons.push({ label: 'Save to library', title: 'Keep a copy to use on tables', onClick: () => openDialog({ type: 'save-deck', deckId: deck.id }) });
    }
  }
  if (cards.length > 0 && !deck) {
    buttons.push({ label: 'Flip', title: 'Flip (F)', onClick: () => s.flip(cards.map((c) => c.id)) });
  }
  if (cards.length + decks.length > 1) {
    buttons.push({
      label: 'Stack into deck',
      onClick: () => s.stackIntoDeck([...cards, ...decks].map((c) => c.id)),
    });
  }
  buttons.push({ label: 'Delete', title: 'Delete (Del)', onClick: () => s.deleteItems(s.selection) });

  return (
    <div className="selection-bar no-board" style={style} onPointerDown={(e) => e.stopPropagation()}>
      {buttons.map((b) => (
        <button key={b.label} className={b.primary ? 'primary' : undefined} title={b.title} onClick={b.onClick}>
          {b.label}
        </button>
      ))}
    </div>
  );
}
