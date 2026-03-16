import type {
  CardDefinition,
  MatchProjection,
  ScaleKey
} from '../../../../../packages/shared-types/src/index.ts';

export const HIDER_HAND_TARGET = 6;

export type CardReadinessTone = 'success' | 'warning' | 'info';

export interface CardWorkbookPlayability {
  label: string;
  tone: CardReadinessTone;
  detail: string;
}

function normalizedCardName(cardDefinition: CardDefinition): string {
  return cardDefinition.name.trim().toLowerCase();
}

function isQuestionWindowOpen(projection: MatchProjection | undefined) {
  return projection?.lifecycleState === 'seek_phase' &&
    (
      projection.seekPhaseSubstate === 'ready' ||
      projection.seekPhaseSubstate === 'awaiting_question_selection' ||
      projection.seekPhaseSubstate === 'awaiting_question_answer' ||
      projection.seekPhaseSubstate === 'applying_constraints'
    );
}

export function buildKnownPowerUpDescription(cardDefinition: CardDefinition): string | undefined {
  switch (normalizedCardName(cardDefinition)) {
    case 'randomize':
      return 'Redraw the current clue set and replace it with a fresh workbook draw from the same category.';
    case 'veto':
      return 'Reject a clue option that helps the seekers and replace it with a different card from the same draw set.';
    case 'duplicate':
      return 'Keep an extra copy of a strong clue or effect so the same pressure can be applied again with host confirmation.';
    case 'move':
      return 'Create a movement-based escape or reposition moment before the next seeker clue settles in.';
    case 'discard 1 draw 2':
      return 'Discard one spare card from hand, then draw two replacements to improve your response options.';
    case 'discard 2 draw 3':
      return 'Discard two spare cards from hand, then draw three replacements to dig deeper into the deck.';
    case 'draw 1 expand 1':
      return 'Draw one extra option and expand the keep limit for the current question-response round by one.';
    default:
      return undefined;
  }
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

export function buildScaleAwareTimeBonusDescription(
  cardDefinition: CardDefinition,
  selectedScale: ScaleKey | undefined
): string | undefined {
  const minutes = resolveScaleBonusMinutes(cardDefinition, selectedScale);
  if (minutes === undefined || !selectedScale) {
    return undefined;
  }

  return `This ${selectedScale} match would gain ${minutes} minute${minutes === 1 ? '' : 's'} if this bonus resolves.`;
}

export function buildCurseEffectTags(cardDefinition: CardDefinition): string[] {
  if (cardDefinition.kind !== 'curse') {
    return [];
  }

  const description = cardDefinition.description.toLowerCase();
  const tags: string[] = [];

  if (/question|ask another question|disabled/.test(description)) {
    tags.push('Affects question access');
  }

  if (/transport|turn right|steps|move|travel|outside/.test(description)) {
    tags.push('Affects movement or travel');
  }

  if (/minute|minutes|hour|hours|timer/.test(description)) {
    tags.push('Changes time pressure');
  }

  if (/draw|hand|discard/.test(description)) {
    tags.push('Changes hand or draw rules');
  }

  if (/die|dice/.test(description)) {
    tags.push('Needs a dice check');
  }

  return tags;
}

function getDiscardCostNeed(cardDefinition: CardDefinition): {
  requiredCards?: number;
  requiredKind?: CardDefinition['kind'];
  discardWholeHand?: boolean;
} {
  switch (normalizedCardName(cardDefinition)) {
    case 'discard 1 draw 2':
      return {
        requiredCards: 1
      };
    case 'discard 2 draw 3':
      return {
        requiredCards: 2
      };
  }

  const costLines = cardDefinition.castingCost?.map((cost) => cost.description.toLowerCase()) ?? [];
  for (const line of costLines) {
    const discardMatch = line.match(/discard (\d+) cards?/);
    if (discardMatch) {
      return {
        requiredCards: Number.parseInt(discardMatch[1]!, 10)
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

export function buildCardWorkbookPlayability(args: {
  card: CardDefinition;
  projection: MatchProjection | undefined;
  selectedScale: ScaleKey | undefined;
  handCardCount: number;
  handCardKindCounts: Partial<Record<CardDefinition['kind'], number>>;
}): CardWorkbookPlayability {
  const lowerName = normalizedCardName(args.card);

  if (args.card.kind === 'time_bonus') {
    const scaleDescription = buildScaleAwareTimeBonusDescription(args.card, args.selectedScale);
    return {
      label: 'Playable now',
      tone: 'success',
      detail: scaleDescription ?? 'This time bonus uses the current game size when it resolves.'
    };
  }

  if (
    args.card.kind === 'curse' &&
    args.projection?.lifecycleState === 'endgame' &&
    /cannot be played during the endgame/.test(args.card.description.toLowerCase())
  ) {
    return {
      label: 'Not playable yet',
      tone: 'warning',
      detail: 'This curse explicitly says it cannot be played during the endgame.'
    };
  }

  const discardNeed = getDiscardCostNeed(args.card);
  const otherHandCardCount = Math.max(0, args.handCardCount - 1);
  if (discardNeed.discardWholeHand && args.handCardCount <= 1) {
    return {
      label: 'Not playable yet',
      tone: 'warning',
      detail: 'This card asks the hider team to discard the rest of the hand, but no spare hand cards are visible right now.'
    };
  }

  if (discardNeed.requiredCards !== undefined) {
    if (discardNeed.requiredKind) {
      const matchingCards = args.handCardKindCounts[discardNeed.requiredKind] ?? 0;
      if (matchingCards < discardNeed.requiredCards) {
        return {
          label: 'Not playable yet',
          tone: 'warning',
          detail: `This card needs ${discardNeed.requiredKind.replace(/_/g, ' ')} discard payment, but the current visible hand does not show enough matching cards.`
        };
      }
    } else if (otherHandCardCount < discardNeed.requiredCards) {
      return {
        label: 'Not playable yet',
        tone: 'warning',
        detail: `This card asks the hider team to discard ${discardNeed.requiredCards} other card${discardNeed.requiredCards === 1 ? '' : 's'}, but the current visible hand is too small.`
      };
    }
  }

  if (
    args.card.kind === 'power_up' &&
    ['randomize', 'veto', 'duplicate', 'draw 1 expand 1'].includes(lowerName) &&
    !isQuestionWindowOpen(args.projection)
  ) {
    return {
      label: 'Wait for a clue window',
      tone: 'info',
      detail: 'This power-up is strongest when the team is drawing or answering question cards. Keep it ready for the next clue window.'
    };
  }

  if (args.card.kind === 'curse' || args.card.kind === 'power_up') {
    return {
      label: 'Manual check required',
      tone: 'info',
      detail: 'The workbook effect is available, but the current app still expects players or a host to resolve the detailed outcome honestly.'
    };
  }

  return {
    label: 'Playable now',
    tone: 'success',
    detail: 'The current match state does not expose any extra workbook restriction for this card.'
  };
}

export function buildQuestionResponseCardReason(
  cardDefinition: CardDefinition,
  activeQuestionCategoryId: string | undefined,
  selectedScale: ScaleKey | undefined
): string | undefined {
  const lowerName = normalizedCardName(cardDefinition);

  if (cardDefinition.kind === 'time_bonus') {
    const scaleDescription = buildScaleAwareTimeBonusDescription(cardDefinition, selectedScale);
    return scaleDescription ?? 'Buys extra hide time if the team decides this is the right moment to cash it in.';
  }

  if (cardDefinition.kind === 'curse') {
    return 'Applies a manual challenge that can slow the seekers before their next clue window opens.';
  }

  switch (lowerName) {
    case 'randomize':
      return 'Useful when the current clue draw gives the seekers options you would rather replace.';
    case 'veto':
      return 'Useful when one clue option looks especially dangerous and the team wants it gone.';
    case 'duplicate':
      return 'Useful when a strong clue or effect should be repeated with host confirmation.';
    case 'move':
      return activeQuestionCategoryId === 'thermometer' || activeQuestionCategoryId === 'radar'
        ? 'Especially useful when movement-based clues are about to matter.'
        : 'Best when the hider team needs a movement-focused response before the next clue.';
    case 'discard 1 draw 2':
    case 'discard 2 draw 3':
      return 'A hand-cycling response card that helps dig for a better answer or stronger curse.';
    case 'draw 1 expand 1':
      return 'Adds one more option and one more keep slot to the current clue response round.';
    default:
      return undefined;
  }
}
