import { memo } from 'react';
import type { BoardItem } from '../types';
import { DEFAULT_CARD, TEXT_SIZE } from '../lib/geometry';
import { useBoard } from '../store';
import { useUi } from '../ui';

interface Props {
  item: BoardItem;
  selected: boolean;
  dragging: boolean;
  dropTarget: boolean;
  shuffling: boolean;
}

export const ItemView = memo(function ItemView({ item, selected, dragging, dropTarget, shuffling }: Props) {
  const classes = ['item', `item-${item.kind}`];
  if (selected) classes.push('selected');
  if (dragging) classes.push('dragging');
  if (dropTarget) classes.push('drop-target');
  if (shuffling) classes.push('shuffling');
  const style = { transform: `translate(${item.x}px, ${item.y}px)`, zIndex: item.z };

  return (
    <div className={classes.join(' ')} style={style} data-item={item.id}>
      {item.kind === 'image' && <ImageBody assetId={item.assetId} w={item.w} h={item.h} selected={selected} />}
      {item.kind === 'card' && <CardFace cardId={item.cardId} faceUp={item.faceUp} />}
      {item.kind === 'deck' && (
        <DeckBody cardIds={item.cardIds} faceUp={item.faceUp} name={item.name} w={item.cardWidth} h={item.cardHeight} />
      )}
      {item.kind === 'text' && <TextBody id={item.id} text={item.text} />}
    </div>
  );
});

function ImageBody({ assetId, w, h, selected }: { assetId: string; w: number; h: number; selected: boolean }) {
  const src = useBoard((s) => s.assets[assetId]?.src);
  return (
    <div style={{ width: w, height: h }}>
      <img src={src} width={w} height={h} draggable={false} alt="" />
      {selected && <div className="resize-handle" data-resize />}
    </div>
  );
}

export function CardFace({ cardId, faceUp }: { cardId: string; faceUp: boolean }) {
  const card = useBoard((s) => s.cards[cardId]);
  // A card the server has not revealed yet shows its back.
  const showFace = faceUp && !card?.hidden;
  const src = useBoard((s) => (card ? s.assets[showFace ? card.faceAssetId : card.backAssetId]?.src : undefined));
  if (!card) return null;
  return (
    <div className="card" style={{ width: card.width, height: card.height }} title={showFace ? card.name : undefined}>
      <img src={src} draggable={false} alt={showFace ? card.name : 'Card back'} />
    </div>
  );
}

function DeckBody({ cardIds, faceUp, name, w, h }: { cardIds: string[]; faceUp: boolean; name: string; w?: number; h?: number }) {
  const top = cardIds[cardIds.length - 1];
  const card = useBoard((s) => (top ? s.cards[top] : undefined));
  const width = card?.width ?? w ?? DEFAULT_CARD.w;
  const height = card?.height ?? h ?? DEFAULT_CARD.h;
  // Visible edges under the top card; more for bigger decks, capped so large decks stay tidy.
  const layers = cardIds.length < 2 ? 0 : Math.min(5, 2 + Math.floor(cardIds.length / 10));
  const count = cardIds.length;
  return (
    <div className="deck" style={{ width, height }}>
      <div className="deck-mat" />
      {Array.from({ length: layers }, (_, i) => (
        <div key={i} className="deck-layer" style={{ translate: `${(layers - i) * 4}px ${(layers - i) * 4}px` }} />
      ))}
      {card ? <CardFace cardId={top} faceUp={faceUp} /> : <div className="deck-empty">Empty deck</div>}
      <div className="deck-label">
        <span className="deck-name">{name}</span>
        <span className="deck-count">
          {count} card{count === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}

function TextBody({ id, text }: { id: string; text: string }) {
  const editing = useUi((u) => u.editingTextId === id);
  const setEditing = useUi((u) => u.setEditingText);
  const update = useBoard((s) => s.updateItem);
  if (editing) {
    return (
      <input
        className="text-edit"
        style={{ width: TEXT_SIZE.w, height: TEXT_SIZE.h }}
        autoFocus
        defaultValue={text}
        onPointerDown={(e) => e.stopPropagation()}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => {
          update(id, { text: e.currentTarget.value || 'Label' });
          setEditing(null);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur();
        }}
      />
    );
  }
  return (
    <div className="text" style={{ width: TEXT_SIZE.w, height: TEXT_SIZE.h }}>
      {text}
    </div>
  );
}
