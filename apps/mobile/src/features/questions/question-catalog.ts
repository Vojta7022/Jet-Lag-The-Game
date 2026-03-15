import type {
  ContentPack,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  MatchProjection,
  VisibleConstraintProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

export interface QuestionCategoryViewModel {
  category: QuestionCategoryDefinition;
  templates: QuestionTemplateDefinition[];
}

function sortByName<T extends { name: string }>(values: T[]): T[] {
  return [...values].sort((left, right) => left.name.localeCompare(right.name));
}

export function buildQuestionCategoryViewModels(contentPack: ContentPack): QuestionCategoryViewModel[] {
  return sortByName(contentPack.questionCategories).map((category) => ({
    category,
    templates: sortByName(
      contentPack.questionTemplates.filter((template) => template.categoryId === category.categoryId)
    )
  }));
}

export function findQuestionCategory(
  contentPack: ContentPack,
  categoryId: string | undefined
): QuestionCategoryDefinition | undefined {
  if (!categoryId) {
    return undefined;
  }

  return contentPack.questionCategories.find((category) => category.categoryId === categoryId);
}

export function findQuestionTemplate(
  contentPack: ContentPack,
  templateId: string | undefined
): QuestionTemplateDefinition | undefined {
  if (!templateId) {
    return undefined;
  }

  return contentPack.questionTemplates.find((template) => template.templateId === templateId);
}

export function findActiveQuestion(
  projection: MatchProjection | undefined
): VisibleQuestionProjection | undefined {
  if (!projection) {
    return undefined;
  }

  return [...projection.visibleQuestions]
    .reverse()
    .find((question) =>
      question.status === 'awaiting_answer' ||
      question.status === 'applying_constraints' ||
      question.status === 'awaiting_card_resolution'
    );
}

export function findLatestResolvedQuestion(
  projection: MatchProjection | undefined
): VisibleQuestionProjection | undefined {
  if (!projection) {
    return undefined;
  }

  return [...projection.visibleQuestions]
    .reverse()
    .find((question) => question.status === 'resolved');
}

export function findConstraintForQuestion(
  projection: MatchProjection | undefined,
  questionInstanceId: string | undefined
): VisibleConstraintProjection | undefined {
  if (!projection || !questionInstanceId) {
    return undefined;
  }

  return [...projection.visibleConstraints]
    .reverse()
    .find((constraint) => constraint.sourceQuestionInstanceId === questionInstanceId);
}

export function summarizeAnswer(answer: Record<string, unknown> | undefined): string {
  if (!answer) {
    return 'No answer recorded yet.';
  }

  if (typeof answer.value === 'string' && answer.value.length > 0) {
    return answer.value;
  }

  if (typeof answer.selection === 'string' && answer.selection.length > 0) {
    return answer.selection;
  }

  if (typeof answer.selectedFeatureId === 'string' && answer.selectedFeatureId.length > 0) {
    return answer.selectedFeatureId;
  }

  const attachmentIds = Array.isArray(answer.attachmentIds)
    ? answer.attachmentIds.filter((value): value is string => typeof value === 'string' && value.length > 0)
    : [];
  if (attachmentIds.length > 0) {
    return `${attachmentIds.length} evidence attachment${attachmentIds.length === 1 ? '' : 's'}`;
  }

  const note = typeof answer.note === 'string' ? answer.note.trim() : '';
  if (note.length > 0) {
    return note;
  }

  return 'Answer data recorded.';
}

export function formatResolutionMode(mode: VisibleConstraintProjection['resolutionMode'] | undefined): string {
  if (mode === 'exact') {
    return 'Exact';
  }

  if (mode === 'approximate') {
    return 'Approximate';
  }

  if (mode === 'metadata_only') {
    return 'Metadata-only';
  }

  return 'Pending';
}
