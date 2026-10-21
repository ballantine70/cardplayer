import { memo } from 'react';
import type { BoardItem } from '../types';
import { TEXT_SIZE } from '../lib/geometry';
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
      {item.kind === 'deck' && <DeckBody cardIds={item.cardIds} faceUp={item.faceUp} name={item.name} />}
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

function DeckBody({ cardIds, faceUp, name }: { cardIds: string[]; faceUp: boolean; name: string }) {
  const top = cardIds[cardIds.length - 1];
  const card = useBoard((s) => s.cards[top]);
  if (!card) return null;
  // Thickness grows with the number of cards, capped so large decks stay tidy.
  const layers = Math.min(6, Math.ceil(cardIds.length / 6));
  const shadow = Array.from({ length: layers }, (_, i) => `${i + 1}px ${(i + 1) * 1.5}px 0 #d8d4cc, ${i + 1}px ${(i + 1) * 1.5}px 0 1px #9993`).join(', ');
  return (
    <div className="deck" style={{ boxShadow: shadow, width: card.width, height: card.height }}>
      <CardFace cardId={top} faceUp={faceUp} />
      <div className="deck-count" title={name}>
        {cardIds.length}
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
