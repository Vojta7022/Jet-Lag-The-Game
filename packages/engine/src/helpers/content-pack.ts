import type {
  CardDefinition,
  ContentPack,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  RulesetDefinition
} from '../../../shared-types/src/index.ts';

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
    return undefined;
  }

  return contentPack.rulesets.find((ruleset) => ruleset.rulesetId === rulesetId);
}

export function getHidePhaseDurationSeconds(contentPack: ContentPack, rulesetId: string | undefined): number {
  const ruleset = getRuleset(contentPack, rulesetId);
  const explicitDuration = ruleset?.phasePolicies?.hidePhaseDurationSeconds;

  if (typeof explicitDuration === 'number' && explicitDuration > 0) {
    return explicitDuration;
  }

  return 300;
}

export function getQuestionCooldownSeconds(
  contentPack: ContentPack,
  rulesetId: string | undefined,
  templateId: string
): number {
  const ruleset = getRuleset(contentPack, rulesetId);
  const explicitDuration = ruleset?.questionPolicies?.cooldownSeconds;

  if (typeof explicitDuration === 'number' && explicitDuration > 0) {
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
