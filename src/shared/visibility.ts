import type { BoardItem, Card, RoomSettings } from '../types.ts';

/** How much of a card a player may see: its face, only its back, or nothing. */
export type Sight = 'face' | 'back';

/**
 * What `playerId` may see of each card. Cards missing from the map are fully
 * hidden: buried in a deck, or in someone else's private hand. Backs matter
 * because a deck's cards can each have a different back.
 */
export function cardSight(items: Record<string, BoardItem>, settings: RoomSettings, playerId: string): Map<string, Sight> {
  const out = new Map<string, Sight>();
  for (const it of Object.values(items)) {
    if (it.kind === 'card') {
      if (it.holder) {
        if (it.holder === playerId || !settings.privateHands) out.set(it.cardId, 'face');
      } else {
        out.set(it.cardId, it.faceUp || !settings.hideFaceDown ? 'face' : 'back');
      }
    } else if (it.kind === 'deck') {
      if (!settings.hideFaceDown) it.cardIds.forEach((id) => out.set(id, 'face'));
      else if (it.cardIds.length) out.set(it.cardIds[it.cardIds.length - 1], it.faceUp ? 'face' : 'back');
    }
  }
  return out;
}

/** Ids of the cards whose faces and details `playerId` may see. */
export function visibleCardIds(items: Record<string, BoardItem>, settings: RoomSettings, playerId: string): Set<string> {
  const out = new Set<string>();
  for (const [id, sight] of cardSight(items, settings, playerId)) if (sight === 'face') out.add(id);
  return out;
}

/** A copy of a card with its face and details removed, and its back too unless `keepBack`. */
export function redactCard(card: Card, keepBack = true): Card {
  return {
    id: card.id,
    faceAssetId: '',
    backAssetId: keepBack ? card.backAssetId : '',
    width: card.width,
    height: card.height,
    name: '',
    value: '',
    description: '',
    homeDeckId: card.homeDeckId,
    hidden: true,
  };
}
