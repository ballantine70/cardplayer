import type { BoardItem, Card, RoomSettings } from '../types.ts';

/** Ids of the cards whose faces and details `playerId` may see. */
export function visibleCardIds(
  items: Record<string, BoardItem>,
  settings: RoomSettings,
  playerId: string,
): Set<string> {
  const out = new Set<string>();
  for (const it of Object.values(items)) {
    if (it.kind === 'card') {
      const visible = it.holder
        ? it.holder === playerId || !settings.privateHands
        : it.faceUp || !settings.hideFaceDown;
      if (visible) out.add(it.cardId);
    } else if (it.kind === 'deck') {
      if (!settings.hideFaceDown) it.cardIds.forEach((id) => out.add(id));
      else if (it.faceUp && it.cardIds.length) out.add(it.cardIds[it.cardIds.length - 1]);
    }
  }
  return out;
}

/** A copy of a card with everything that identifies its face removed. */
export function redactCard(card: Card): Card {
  return {
    id: card.id,
    faceAssetId: '',
    backAssetId: card.backAssetId,
    width: card.width,
    height: card.height,
    name: '',
    value: '',
    description: '',
    homeDeckId: card.homeDeckId,
    hidden: true,
  };
}
