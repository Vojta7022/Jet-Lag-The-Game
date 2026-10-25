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
  kind: 'manual_only' | 'move' | 'discard_then_draw' | 'draw_and_expand_hand' | 'veto_question' | 'randomize_question' | 'time_bonus' | 'disable_question_templates' | 'random_question_category_lock' | 'extra_question_reward_draws' | 'hangman_challenge' | 'bridge_troll_challenge' | 'seeker_off_transit_challenge' | 'u_turn_challenge' | 'ransom_note_challenge' | 'cairn_challenge' | 'water_weight_challenge' | 'endless_tumble_challenge' | 'lemon_phylactery_challenge' | 'gamblers_feet_challenge' | 'egg_partner_challenge' | 'jammed_door_challenge' | 'zoologist_challenge' | 'luxury_car_challenge';
  discardRequirement: CardDiscardRequirement;
  drawCountOnResolve?: number;
  handSizeIncreaseOnResolve?: number;
  timeBonusMinutes?: number;
  minimumDistanceMeters?: number;
  successfulDieResults?: number[];
  questionTemplateCount?: number;
  requireDistinctQuestionCategories?: boolean;
  rerollAfterQuestion?: boolean;
  questionRewardCount?: number;
  extraQuestionRewardDrawCount?: number;
  moveDurationSeconds?: number;
  activeDurationMinutes?: number;
  doorwayRetryCooldownMinutes?: number;
  doorwayMinimumTotal?: number;
}

function normalizedCardName(cardDefinition: CardDefinition): string {
  return cardDefinition.name.trim().toLowerCase();
}

export function getCardDiscardRequirement(cardDefinition: CardDefinition): CardDiscardRequirement {
  const discardThenDraw = cardDefinition.effects.find((effect) => effect.effectType === 'discard_then_draw');
  const discardCount = (discardThenDraw?.payload as { discardCount?: unknown } | undefined)?.discardCount;
  if (typeof discardCount === 'number' && Number.isInteger(discardCount) && discardCount > 0) {
    return { requiredCards: discardCount };
  }

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

  if (cardDefinition.effects.some((effect) => effect.effectType === 'hangman_challenge')) {
    return { kind: 'hangman_challenge', discardRequirement: {} };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'bridge_troll_challenge')) {
    return { kind: 'bridge_troll_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'seeker_off_transit_challenge')) {
    return { kind: 'seeker_off_transit_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'u_turn_challenge')) {
    const effect = cardDefinition.effects.find((candidate) => candidate.effectType === 'u_turn_challenge');
    const payload = effect?.payload as { alternateTransitWindowMinutesByScale?: Partial<Record<ScaleKey, number>> } | undefined;
    const configuredMinutes = selectedScale ? payload?.alternateTransitWindowMinutesByScale?.[selectedScale] : undefined;
    return {
      kind: 'u_turn_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      activeDurationMinutes: Number.isInteger(configuredMinutes) && configuredMinutes! > 0 ? configuredMinutes : undefined
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'ransom_note_challenge')) {
    return { kind: 'ransom_note_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'cairn_challenge')) {
    return { kind: 'cairn_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'water_weight_challenge')) {
    return {
      kind: 'water_weight_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'endless_tumble_challenge')) {
    const tumbleEffect = cardDefinition.effects.find((effect) => effect.effectType === 'endless_tumble_challenge');
    const payload = tumbleEffect?.payload as { minimumDistanceMeters?: unknown; successfulDieResults?: unknown } | undefined;
    const minimumDistanceMeters = typeof payload?.minimumDistanceMeters === 'number' && Number.isFinite(payload.minimumDistanceMeters) && payload.minimumDistanceMeters > 0
      ? payload.minimumDistanceMeters
      : 30;
    const configuredSuccessfulDieResults = Array.isArray(payload?.successfulDieResults)
      ? payload.successfulDieResults.filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= 6)
      : [];
    const successfulDieResults = configuredSuccessfulDieResults.length > 0 ? configuredSuccessfulDieResults : [5, 6];
    return {
      kind: 'endless_tumble_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale),
      minimumDistanceMeters,
      successfulDieResults
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'lemon_phylactery_challenge')) {
    return {
      kind: 'lemon_phylactery_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'gamblers_feet_challenge')) {
    return {
      kind: 'gamblers_feet_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      activeDurationMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'egg_partner_challenge')) {
    return {
      kind: 'egg_partner_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'jammed_door_challenge')) {
    const effect = cardDefinition.effects.find((candidate) => candidate.effectType === 'jammed_door_challenge');
    const payload = effect?.payload as { retryCooldownMinutesByScale?: Partial<Record<ScaleKey, unknown>>; minimumTotal?: unknown } | undefined;
    const configuredCooldown = selectedScale ? payload?.retryCooldownMinutesByScale?.[selectedScale] : undefined;
    const cooldownMinutes = typeof configuredCooldown === 'number' && Number.isFinite(configuredCooldown) && configuredCooldown > 0 ? configuredCooldown : 10;
    const minimumTotal = typeof payload?.minimumTotal === 'number' && Number.isInteger(payload.minimumTotal) && payload.minimumTotal >= 2 && payload.minimumTotal <= 12 ? payload.minimumTotal : 7;
    return {
      kind: 'jammed_door_challenge',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      activeDurationMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale),
      doorwayRetryCooldownMinutes: cooldownMinutes,
      doorwayMinimumTotal: minimumTotal
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'zoologist_challenge')) {
    return { kind: 'zoologist_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'luxury_car_challenge')) {
    return { kind: 'luxury_car_challenge', discardRequirement: getCardDiscardRequirement(cardDefinition) };
  }

  if (cardDefinition.kind === 'time_bonus') {
    return {
      kind: 'time_bonus',
      discardRequirement: {},
      timeBonusMinutes: resolveScaleBonusMinutes(cardDefinition, selectedScale)
    };
  }

  const discardThenDraw = cardDefinition.effects.find((effect) => effect.effectType === 'discard_then_draw');
  if (discardThenDraw) {
    const payload = discardThenDraw.payload as { discardCount?: unknown; drawCount?: unknown } | undefined;
    const discardCount = typeof payload?.discardCount === 'number' && payload.discardCount > 0
      ? Math.floor(payload.discardCount)
      : undefined;
    const drawCount = typeof payload?.drawCount === 'number' && payload.drawCount > 0
      ? Math.floor(payload.drawCount)
      : undefined;
    if (discardCount !== undefined && drawCount !== undefined) {
      return {
        kind: 'discard_then_draw',
        discardRequirement: { requiredCards: discardCount },
        drawCountOnResolve: drawCount
      };
    }
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

  const expansionEffect = cardDefinition.effects.find((effect) => effect.effectType === 'draw_and_expand_hand');
  if (expansionEffect) {
    const payload = expansionEffect.payload as { drawCount?: unknown; handSizeIncrease?: unknown } | undefined;
    const drawCount = typeof payload?.drawCount === 'number' && payload.drawCount > 0
      ? Math.floor(payload.drawCount)
      : 1;
    const handSizeIncrease = typeof payload?.handSizeIncrease === 'number' && payload.handSizeIncrease > 0
      ? Math.floor(payload.handSizeIncrease)
      : 1;
    return {
      kind: 'draw_and_expand_hand',
      discardRequirement: {},
      drawCountOnResolve: drawCount,
      handSizeIncreaseOnResolve: handSizeIncrease
    };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'veto_question')) {
    return { kind: 'veto_question', discardRequirement: {} };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'randomize_question')) {
    return { kind: 'randomize_question', discardRequirement: {} };
  }

  if (cardDefinition.effects.some((effect) => effect.effectType === 'move_power_up')) {
    const moveEffect = cardDefinition.effects.find((effect) => effect.effectType === 'move_power_up');
    const durationMinutesByScale = (moveEffect?.payload as { durationMinutesByScale?: Partial<Record<ScaleKey, number>> } | undefined)?.durationMinutesByScale;
    const durationMinutes = selectedScale ? durationMinutesByScale?.[selectedScale] : undefined;
    return {
      kind: 'move',
      discardRequirement: { discardWholeHand: true },
      moveDurationSeconds: typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0
        ? durationMinutes * 60
        : undefined
    };
  }

  const disableTemplatesEffect = cardDefinition.effects.find((effect) => effect.effectType === 'disable_question_templates');
  if (disableTemplatesEffect) {
    const payload = disableTemplatesEffect.payload as { questionCount?: unknown; requireDistinctCategories?: unknown } | undefined;
    const questionTemplateCount = typeof payload?.questionCount === 'number' && Number.isInteger(payload.questionCount) && payload.questionCount > 0
      ? payload.questionCount
      : undefined;
    if (questionTemplateCount !== undefined) {
      return {
        kind: 'disable_question_templates',
        discardRequirement: getCardDiscardRequirement(cardDefinition),
        questionTemplateCount,
        requireDistinctQuestionCategories: payload?.requireDistinctCategories === true
      };
    }
  }

  const randomCategoryEffect = cardDefinition.effects.find((effect) => effect.effectType === 'random_question_category_lock');
  if (randomCategoryEffect) {
    const payload = randomCategoryEffect.payload as { rerollAfterQuestion?: unknown } | undefined;
    return {
      kind: 'random_question_category_lock',
      discardRequirement: getCardDiscardRequirement(cardDefinition),
      rerollAfterQuestion: payload?.rerollAfterQuestion === true
    };
  }

  const extraQuestionRewardDrawsEffect = cardDefinition.effects.find((effect) => effect.effectType === 'extra_question_reward_draws');
  if (extraQuestionRewardDrawsEffect) {
    const payload = extraQuestionRewardDrawsEffect.payload as { questionCount?: unknown; extraDrawCount?: unknown } | undefined;
    const questionRewardCount = typeof payload?.questionCount === 'number' && Number.isInteger(payload.questionCount) && payload.questionCount > 0
      ? payload.questionCount
      : undefined;
    const extraQuestionRewardDrawCount = typeof payload?.extraDrawCount === 'number' && Number.isInteger(payload.extraDrawCount) && payload.extraDrawCount > 0
      ? payload.extraDrawCount
      : undefined;
    if (questionRewardCount !== undefined && extraQuestionRewardDrawCount !== undefined) {
      return {
        kind: 'extra_question_reward_draws',
        discardRequirement: getCardDiscardRequirement(cardDefinition),
        questionRewardCount,
        extraQuestionRewardDrawCount
      };
    }
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
  const copiedCardId = args.resolution.copiedCardInstanceId;

  return openingHandIds.filter((cardInstanceId) => {
    if (cardInstanceId === sourceId || cardInstanceId === copiedCardId) {
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
  const copiedCardId = args.resolution.copiedCardInstanceId;

  return openingHandIds.filter((cardInstanceId) => {
    if (cardInstanceId === sourceId || cardInstanceId === copiedCardId) {
      return false;
    }

    const card = args.cardInstances[cardInstanceId];
    if (card?.zone !== 'discard_pile') {
      return false;
    }

    return args.cardDefinitionsById[card.cardDefinitionId]?.kind === args.requiredKind;
  }).length;
}

