import { useState } from 'react';
import type { Card } from '../types';
import { useBoard } from '../store';
import { useUi } from '../ui';

/** Side panel for the metadata of the selected card, deck or label; shown on request. */
export function Inspector() {
  const open = useUi((u) => u.detailsOpen);
  const toggle = useUi((u) => u.toggleDetails);
  if (!open) return null;
  return (
    <aside className="inspector no-board" aria-label="Details">
      <button className="icon inspector-close" aria-label="Hide details" title="Hide details (I)" onClick={() => toggle(false)}>
        ×
      </button>
      <InspectorContent />
    </aside>
  );
}

function InspectorContent() {
  const selection = useBoard((s) => s.selection);
  const item = useBoard((s) => (s.selection.length === 1 ? s.items[s.selection[0]] : undefined));
  const cards = useBoard((s) => s.cards);
  const assets = useBoard((s) => s.assets);
  const updateItem = useBoard((s) => s.updateItem);
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!item || item.kind === 'image') {
    return (
      <>
        <h3>Details</h3>
        <p className="muted">
          {selection.length > 1 ? `${selection.length} objects selected.` : 'Select a card, deck or label to see and edit its details.'}
        </p>
      </>
    );
  }

  if (item.kind === 'text') {
    return (
      <>
        <h3>Label</h3>
        <label className="field">
          <span>Text</span>
          <input value={item.text} onChange={(e) => updateItem(item.id, { text: e.target.value })} />
        </label>
      </>
    );
  }

  if (item.kind === 'card') {
    const card = cards[item.cardId];
    if (!card) return null;
    const showFace = (item.faceUp || !!item.holder) && !card.hidden;
    return (
      <>
        <h3>{item.holder ? 'Card in your hand' : 'Card'}</h3>
        <img className="inspector-preview" src={assets[showFace ? card.faceAssetId : card.backAssetId]?.src} alt="" />
        {!item.faceUp && !item.holder && <p className="muted">Face down</p>}
        {card.hidden ? <p className="muted">Hidden from you.</p> : <CardFields card={card} />}
      </>
    );
  }

  // Deck: top card first.
  const ordered = item.cardIds.slice().reverse();
  return (
    <>
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
          if (c.hidden) {
            return (
              <li key={id}>
                <div className="deck-list-row muted">
                  {assets[c.backAssetId] ? <img src={assets[c.backAssetId].src} alt="" /> : <span className="hidden-thumb" />}
                  <span className="name">Hidden card</span>
                </div>
              </li>
            );
          }
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
    </>
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
