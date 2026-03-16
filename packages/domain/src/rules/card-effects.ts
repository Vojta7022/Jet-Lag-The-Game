import type {
  CardDefinition,
  CardInstanceModel,
  CardResolutionWindow,
  ScaleKey
} from '../../../shared-types/src/index.ts';

export interface CardDiscardRequirement {
  requiredCards?: number;
  requiredKind?: CardDefinition['kind'];
  discardWholeHand?: boolean;
}

export interface CardResolutionPlan {
  kind: 'manual_only' | 'discard_then_draw' | 'time_bonus';
  discardRequirement: CardDiscardRequirement;
  drawCountOnResolve?: number;
  timeBonusMinutes?: number;
}

function normalizedCardName(cardDefinition: CardDefinition): string {
  return cardDefinition.name.trim().toLowerCase();
}

export function getCardDiscardRequirement(cardDefinition: CardDefinition): CardDiscardRequirement {
  switch (normalizedCardName(cardDefinition)) {
    case 'discard 1 draw 2':
      return { requiredCards: 1 };
    case 'discard 2 draw 3':
      return { requiredCards: 2 };
  }

  const costLines = cardDefinition.castingCost?.map((cost) => cost.description.toLowerCase()) ?? [];
  for (const line of costLines) {
    const discardMatch = line.match(/discard (\d+) cards?/);
    if (discardMatch) {
      return {
        requiredCards: Number.parseInt(discardMatch[1]!, 10)
      };
    }

    if (line.includes('discard two cards')) {
      return {
        requiredCards: 2
      };
    }

    if (line.includes('discard a card')) {
      return {
        requiredCards: 1
      };
    }

    if (line.includes('discard your hand')) {
      return {
        discardWholeHand: true
      };
    }

    if (line.includes('discard a time bonus')) {
      return {
        requiredCards: 1,
        requiredKind: 'time_bonus'
      };
    }

    if (line.includes('discard a powerup')) {
      return {
        requiredCards: 1,
        requiredKind: 'power_up'
      };
    }
  }

  return {};
}

export function resolveScaleBonusMinutes(
  cardDefinition: CardDefinition,
  selectedScale: ScaleKey | undefined
): number | undefined {
  if (!selectedScale) {
    return undefined;
  }

  for (const effect of cardDefinition.effects) {
    const payload = effect.payload as
      | {
          minutesByScale?: Partial<Record<ScaleKey, number>>;
        }
      | undefined;
    const value = payload?.minutesByScale?.[selectedScale];
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

export function buildCardResolutionPlan(
  cardDefinition: CardDefinition,
  selectedScale: ScaleKey | undefined
): CardResolutionPlan {
  const lowerName = normalizedCardName(cardDefinition);

  if (cardDefinition.kind === 'time_bonus') {
    return {
      kind: 'time_bonus',
      discardRequirement: {},
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  if (lowerName === 'discard 1 draw 2') {
    return {
      kind: 'discard_then_draw',
      discardRequirement: { requiredCards: 1 },
      drawCountOnResolve: 2
    };
  }

  if (lowerName === 'discard 2 draw 3') {
    return {
      kind: 'discard_then_draw',
      discardRequirement: { requiredCards: 2 },
      drawCountOnResolve: 3
    };
  }

  return {
    kind: 'manual_only',
    discardRequirement: getCardDiscardRequirement(cardDefinition)
  };
}

export function countPaidDiscardCost(args: {
  resolution: CardResolutionWindow;
  cardInstances: Record<string, CardInstanceModel>;
}): number {
  const openingHandIds = args.resolution.openingHandCardInstanceIds ?? [];
  const sourceId = args.resolution.sourceCardInstanceId;

  return openingHandIds.filter((cardInstanceId) => {
    if (cardInstanceId === sourceId) {
      return false;
    }

    const card = args.cardInstances[cardInstanceId];
    return card?.zone === 'discard_pile';
  }).length;
}

export function countPaidDiscardKindCost(args: {
  resolution: CardResolutionWindow;
  cardInstances: Record<string, CardInstanceModel>;
  cardDefinitionsById: Record<string, CardDefinition>;
  requiredKind: CardDefinition['kind'];
}): number {
  const openingHandIds = args.resolution.openingHandCardInstanceIds ?? [];
  const sourceId = args.resolution.sourceCardInstanceId;

  return openingHandIds.filter((cardInstanceId) => {
    if (cardInstanceId === sourceId) {
      return false;
    }

    const card = args.cardInstances[cardInstanceId];
    if (card?.zone !== 'discard_pile') {
      return false;
    }

    return args.cardDefinitionsById[card.cardDefinitionId]?.kind === args.requiredKind;
  }).length;
}

