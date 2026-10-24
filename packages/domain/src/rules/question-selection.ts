import type {
  ContentPack,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey
} from '../../../shared-types/src/index.ts';

interface AskedQuestionLike {
  templateId: string;
  categoryId: string;
  status?: string;
}

export interface QuestionSelectionState {
  categoryId: string;
  availableTemplateIds: string[];
  askedCountByTemplate: Record<string, number>;
  rewardMultiplierByTemplate: Record<string, number>;
}

export function filterQuestionTemplatesForScale(
  templates: QuestionTemplateDefinition[],
  selectedScale: ScaleKey | undefined
): QuestionTemplateDefinition[] {
  if (!selectedScale) {
    return templates;
  }

  return templates.filter((template) => template.scaleSet.appliesTo.includes(selectedScale));
}

export function buildQuestionSelectionState(args: {
  contentPack: ContentPack;
  category: QuestionCategoryDefinition;
  selectedScale?: ScaleKey;
  askedQuestions: AskedQuestionLike[];
}): QuestionSelectionState {
  const eligibleTemplates = filterQuestionTemplatesForScale(
    args.contentPack.questionTemplates.filter((template) => template.categoryId === args.category.categoryId),
    args.selectedScale
  );
  const answeredQuestions = args.askedQuestions.filter(
    (question) =>
      question.categoryId === args.category.categoryId &&
      question.status !== 'canceled' &&
      (question.status === undefined || question.status === 'resolved' || question.status === 'vetoed')
  );
  const askedCountByTemplate: Record<string, number> = {};

  for (const question of answeredQuestions) {
    askedCountByTemplate[question.templateId] = (askedCountByTemplate[question.templateId] ?? 0) + 1;
  }

  const availableTemplateIds = eligibleTemplates.map((template) => template.templateId);
  const rewardMultiplierByTemplate = Object.fromEntries(
    availableTemplateIds.map((templateId) => [templateId, (askedCountByTemplate[templateId] ?? 0) + 1])
  );

  return {
    categoryId: args.category.categoryId,
    availableTemplateIds,
    askedCountByTemplate,
    rewardMultiplierByTemplate
  };
}
