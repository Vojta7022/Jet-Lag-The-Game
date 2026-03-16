export function haveSameCardIdSequence(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((cardId, index) => cardId === right[index]);
}

export function filterCardIdsByVisibleHand(currentCardIds: string[], visibleHandCardIds: string[]): string[] {
  return currentCardIds.filter((cardId) => visibleHandCardIds.includes(cardId));
}

export function reconcileDrawTrayCardIds(args: {
  currentTrayCardIds: string[];
  previousHandCardIds: string[];
  nextHandCardIds: string[];
}): string[] {
  const keptVisibleTrayIds = filterCardIdsByVisibleHand(args.currentTrayCardIds, args.nextHandCardIds);
  const newlyDrawnCardIds = args.nextHandCardIds.filter((cardId) => !args.previousHandCardIds.includes(cardId));

  if (newlyDrawnCardIds.length === 0) {
    return keptVisibleTrayIds;
  }

  return [...new Set([...newlyDrawnCardIds, ...keptVisibleTrayIds])];
}
