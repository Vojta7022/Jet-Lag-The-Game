import type {
  ContentPack,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey
} from '../../../shared-types/src/index.ts';

interface AskedQuestionLike {
  templateId: string;
  categoryId: string;
  askedAt?: string;
}

export interface QuestionSelectionState {
  categoryId: string;
  round: number;
  drawCount: number;
  pickCount: number;
  drawnTemplateIds: string[];
  usedTemplateIds: string[];
  availableTemplateIds: string[];
}

function hashText(value: string): number {
  let hash = 0;

  for (const character of value) {
    hash = ((hash * 31) + character.charCodeAt(0)) >>> 0;
  }

  return hash;
}

function sortTemplatesForRound(
  templates: QuestionTemplateDefinition[],
  round: number
): QuestionTemplateDefinition[] {
  return [...templates].sort((left, right) => {
    const leftWeight = hashText(`${round}:${left.templateId}`);
    const rightWeight = hashText(`${round}:${right.templateId}`);

    if (leftWeight !== rightWeight) {
      return leftWeight - rightWeight;
    }

    return left.templateId.localeCompare(right.templateId);
  });
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

function sortAskedQuestions(questions: AskedQuestionLike[]): AskedQuestionLike[] {
  return [...questions].sort((left, right) => {
    const leftAskedAt = left.askedAt ?? '';
    const rightAskedAt = right.askedAt ?? '';

    if (leftAskedAt !== rightAskedAt) {
      return leftAskedAt.localeCompare(rightAskedAt);
    }

    return left.templateId.localeCompare(right.templateId);
  });
}

export function buildQuestionSelectionState(args: {
  contentPack: ContentPack;
  category: QuestionCategoryDefinition;
  selectedScale?: ScaleKey;
  askedQuestions: AskedQuestionLike[];
}): QuestionSelectionState {
  const categoryTemplates = filterQuestionTemplatesForScale(
    args.contentPack.questionTemplates.filter((template) => template.categoryId === args.category.categoryId),
    args.selectedScale
  );
  const drawCount = categoryTemplates.length === 0
    ? 0
    : Math.max(1, Math.min(args.category.drawRule.drawCount, categoryTemplates.length));
  const pickCount = Math.max(1, args.category.drawRule.pickCount);
  const askedInCategory = sortAskedQuestions(
    args.askedQuestions.filter((question) => question.categoryId === args.category.categoryId)
  );
  const round = Math.floor(askedInCategory.length / pickCount) + 1;
  const currentDraw = sortTemplatesForRound(categoryTemplates, round).slice(0, drawCount);
  const usedCountInRound = askedInCategory.length % pickCount;
  const usedTemplateIds = askedInCategory
    .slice(askedInCategory.length - usedCountInRound)
    .map((question) => question.templateId)
    .filter((templateId) => currentDraw.some((template) => template.templateId === templateId));
  const availableTemplateIds = currentDraw
    .map((template) => template.templateId)
    .filter((templateId) => !usedTemplateIds.includes(templateId));

  return {
    categoryId: args.category.categoryId,
    round,
    drawCount,
    pickCount,
    drawnTemplateIds: currentDraw.map((template) => template.templateId),
    usedTemplateIds,
    availableTemplateIds
  };
}
