import type {
  CardDefinition,
  ConstraintDefinition,
  ContentPack,
  MapPresetDefinition,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey,
  RulesetDefinition
} from '../../../shared-types/src/index.ts';

export function getMapPreset(contentPack: ContentPack, mapPresetId: string | undefined): MapPresetDefinition | undefined {
  if (mapPresetId) return contentPack.mapPresets.find((preset) => preset.mapPresetId === mapPresetId);
  return contentPack.mapPresets.length === 1 ? contentPack.mapPresets[0] : undefined;
}

export function getCardDefinition(contentPack: ContentPack, cardDefinitionId: string): CardDefinition | undefined {
  return contentPack.cards.find((card) => card.cardDefinitionId === cardDefinitionId);
}

export function getQuestionTemplate(
  contentPack: ContentPack,
  templateId: string
): QuestionTemplateDefinition | undefined {
  return contentPack.questionTemplates.find((template) => template.templateId === templateId);
}

export function getQuestionCategory(
  contentPack: ContentPack,
  categoryId: string
): QuestionCategoryDefinition | undefined {
  return contentPack.questionCategories.find((category) => category.categoryId === categoryId);
}

export function getRuleset(contentPack: ContentPack, rulesetId: string | undefined): RulesetDefinition | undefined {
  if (!rulesetId) {
    return contentPack.rulesets[0];
  }

  return contentPack.rulesets.find((ruleset) => ruleset.rulesetId === rulesetId);
}

export function getConstraintDefinition(
  contentPack: ContentPack,
  constraintId: string
): ConstraintDefinition | undefined {
  return contentPack.constraints.find((constraint) => constraint.constraintId === constraintId);
}

export function getHidePhaseDurationSeconds(
  contentPack: ContentPack,
  rulesetId: string | undefined,
  selectedScale?: ScaleKey
): number {
  const ruleset = getRuleset(contentPack, rulesetId);
  const durationsByScale = ruleset?.phasePolicies?.hidePhaseDurationSecondsByScale;
  const scaleDuration =
    selectedScale && typeof durationsByScale === 'object' && durationsByScale !== null
      ? (durationsByScale as Partial<Record<ScaleKey, unknown>>)[selectedScale]
      : undefined;

  if (typeof scaleDuration === 'number' && scaleDuration > 0) {
    return scaleDuration;
  }

  const explicitDuration = ruleset?.phasePolicies?.hidePhaseDurationSeconds;

  if (typeof explicitDuration === 'number' && explicitDuration > 0) {
    return explicitDuration;
  }

  return 300;
}

export function getHidingZoneRadiusMeters(
  contentPack: ContentPack,
  rulesetId: string | undefined,
  selectedScale?: ScaleKey
): number {
  const defaultRadius: Record<ScaleKey, number> = { small: 500, medium: 500, large: 1000 };
  const ruleset = getRuleset(contentPack, rulesetId);
  const radii = ruleset?.locationPolicies?.hidingZoneRadiusMetersByScale;
  const configuredRadius = selectedScale && typeof radii === 'object' && radii !== null
    ? (radii as Partial<Record<ScaleKey, unknown>>)[selectedScale]
    : undefined;
  return typeof configuredRadius === 'number' && configuredRadius > 0
    ? configuredRadius
    : selectedScale ? defaultRadius[selectedScale] : 500;
}

export function getQuestionCooldownSeconds(
  contentPack: ContentPack,
  rulesetId: string | undefined,
  templateId: string
): number {
  const ruleset = getRuleset(contentPack, rulesetId);
  const explicitDuration = ruleset?.questionPolicies?.cooldownSeconds;

  if (typeof explicitDuration === 'number' && explicitDuration >= 0) {
    return explicitDuration;
  }

  const template = getQuestionTemplate(contentPack, templateId);
  const category = template ? getQuestionCategory(contentPack, template.categoryId) : undefined;
  const categoryDuration = category?.defaultTimerPolicy.durationSeconds;

  if (typeof categoryDuration === 'number' && categoryDuration > 0) {
    return categoryDuration;
  }

  return 300;
}

export function getQuestionTimerSeconds(
  contentPack: ContentPack,
  templateId: string,
  selectedScale: ScaleKey | undefined
): number {
  const template = getQuestionTemplate(contentPack, templateId);
  const category = template ? getQuestionCategory(contentPack, template.categoryId) : undefined;
  const timerPolicy = category?.defaultTimerPolicy;

  if (!timerPolicy) {
    return 300;
  }

  if (timerPolicy.kind === 'fixed' && typeof timerPolicy.durationSeconds === 'number' && timerPolicy.durationSeconds > 0) {
    return timerPolicy.durationSeconds;
  }

  if (
    timerPolicy.kind === 'by_scale' &&
    selectedScale &&
    typeof timerPolicy.durationSecondsByScale?.[selectedScale] === 'number'
  ) {
    return timerPolicy.durationSecondsByScale[selectedScale]!;
  }

  return 300;
}
