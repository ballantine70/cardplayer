import { useState } from 'react';
import type { Card } from '../types';
import { useBoard } from '../store';

/** Side panel for the metadata of the selected card, deck or label. */
export function Inspector() {
  const selection = useBoard((s) => s.selection);
  const item = useBoard((s) => (s.selection.length === 1 ? s.items[s.selection[0]] : undefined));
  const cards = useBoard((s) => s.cards);
  const assets = useBoard((s) => s.assets);
  const updateItem = useBoard((s) => s.updateItem);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!item || item.kind === 'image') {
    if (selection.length > 1) return <aside className="inspector no-board muted">{selection.length} objects selected</aside>;
    return null;
  }

  if (item.kind === 'text') {
    return (
      <aside className="inspector no-board">
        <h3>Label</h3>
        <label className="field">
          <span>Text</span>
          <input value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} />
        </label>
      </aside>
    );
  }

  if (item.kind === 'card') {
    const card = cards[item.cardId];
    if (!card) return null;
    return (
      <aside className="inspector no-board">
        <h3>Card</h3>
        <img className="inspector-preview" src={assets[item.faceUp ? card.faceAssetId : card.backAssetId]?.src} alt="" />
        {!item.faceUp && <p className="muted">Face down</p>}
        <CardFields card={card} />
      </aside>
    );
  }

  // Deck: top card first.
  const ordered = item.cardIds.slice().reverse();
  return (
    <aside className="inspector no-board">
      <h3>Deck</h3>
      <label className="field">
        <span>Name</span>
        <input value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} />
      </label>
      <p className="muted">
        {item.cardIds.length} cards, {item.faceUp ? 'face up' : 'face down'}. Listed from the top.
      </p>
      <ol className="deck-list">
        {ordered.map((id) => {
          const c = cards[id];
          if (!c) return null;
          const open = expanded === id;
          return (
            <li key={id} className={open ? 'open' : undefined}>
              <button className="deck-list-row" onClick={() => setExpanded(open ? null : id)}>
                <img src={assets[c.faceAssetId]?.src} alt="" />
                <span className="name">{c.name || 'Untitled'}</span>
                <span className="value">{c.value}</span>
              </button>
              {open && <CardFields card={c} />}
            </li>
          );
        })}
      </ol>
    </aside>
  );
}

function CardFields({ card }: { card: Card }) {
  const updateCard = useBoard((s) => s.updateCard);
  return (
    <div className="form">
      <label className="field">
        <span>Name</span>
        <input value={card.name} onChange={(e) => updateCard(card.id, { name: e.target.value })} />
      </label>
      <label className="field">
        <span>Value</span>
        <input value={card.value} onChange={(e) => updateCard(card.id, { value: e.target.value })} />
      </label>
      <label className="field">
        <span>Description</span>
        <textarea rows={4} value={card.description} onChange={(e) => updateCard(card.id, { description: e.target.value })} />
      </label>
    </div>
  );
}
