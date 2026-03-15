import type {
  ContentPack,
  MatchProjection,
  MatchRole,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleMapProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { getSeedRegionFeatureData, hasSeedFeatureCoverage } from './seed-feature-data.ts';

export interface QuestionAnswerDraft {
  selectedValue: string;
  selectedFeatureId: string;
  attachmentIdsText: string;
  note: string;
}

export function createInitialAnswerDraft(template?: QuestionTemplateDefinition): QuestionAnswerDraft {
  const options = template ? getAnswerOptions(template) : [];
  return {
    selectedValue: options[0] ?? '',
    selectedFeatureId: '',
    attachmentIdsText: '',
    note: ''
  };
}

export function buildAnswerPayload(
  template: QuestionTemplateDefinition,
  draft: QuestionAnswerDraft
): Record<string, unknown> {
  const answerKind = String(template.answerSchema.kind ?? 'manual');

  if (answerKind === 'boolean' || answerKind === 'enum') {
    return {
      value: draft.selectedValue
    };
  }

  if (answerKind === 'feature_choice') {
    return {
      selectedFeatureId: draft.selectedFeatureId || draft.selectedValue,
      value: draft.selectedFeatureId || draft.selectedValue
    };
  }

  if (answerKind === 'attachment') {
    const attachmentIds = parseAttachmentIdsText(draft.attachmentIdsText);

    return {
      attachmentIds,
      note: draft.note.trim()
    };
  }

  return {
    value: draft.selectedValue || draft.note.trim()
  };
}

export function parseAttachmentIdsText(value: string): string[] {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

export function appendAttachmentIdToDraft(
  draft: QuestionAnswerDraft,
  attachmentId: string
): QuestionAnswerDraft {
  const nextId = attachmentId.trim();
  if (nextId.length === 0) {
    return draft;
  }

  const nextIds = [...parseAttachmentIdsText(draft.attachmentIdsText)];
  if (!nextIds.includes(nextId)) {
    nextIds.push(nextId);
  }

  return {
    ...draft,
    attachmentIdsText: nextIds.join(', ')
  };
}

export function removeAttachmentIdFromDraft(
  draft: QuestionAnswerDraft,
  attachmentId: string
): QuestionAnswerDraft {
  const nextId = attachmentId.trim();
  if (nextId.length === 0) {
    return draft;
  }

  return {
    ...draft,
    attachmentIdsText: parseAttachmentIdsText(draft.attachmentIdsText)
      .filter((value) => value !== nextId)
      .join(', ')
  };
}

export function getAnswerOptions(template: QuestionTemplateDefinition): string[] {
  const allowedValues = (template.answerSchema.allowedValues ?? template.answerSchema.values) as unknown;
  return Array.isArray(allowedValues)
    ? allowedValues.filter((value): value is string => typeof value === 'string')
    : [];
}

export function chooseConstraintIdForQuestion(args: {
  category: QuestionCategoryDefinition;
  template: QuestionTemplateDefinition;
  question: VisibleQuestionProjection;
}): string | undefined {
  const allowedConstraintIds = args.template.constraintRefs.length > 0
    ? args.template.constraintRefs
    : (args.category.defaultConstraintRefs ?? []);

  if (args.category.resolverKind === 'threshold_distance') {
    const answerValue = typeof args.question.answer?.value === 'string'
      ? args.question.answer.value
      : undefined;
    return answerValue === 'no'
      ? allowedConstraintIds.find((constraintId) => constraintId === 'outside-radius') ?? allowedConstraintIds[0]
      : allowedConstraintIds.find((constraintId) => constraintId === 'within-radius') ?? allowedConstraintIds[0];
  }

  if (args.category.resolverKind === 'photo_challenge') {
    return allowedConstraintIds.find((constraintId) => constraintId === 'photo-evidence') ?? allowedConstraintIds[0];
  }

  return allowedConstraintIds[0];
}

export function buildConstraintResolutionMetadata(args: {
  contentPack: ContentPack;
  visibleMap?: VisibleMapProjection;
  template: QuestionTemplateDefinition;
  question: VisibleQuestionProjection;
}): Record<string, unknown> {
  const featureClassIds = (args.template.featureClassRefs ?? []).map((feature) => feature.featureClassId);
  const featureData = getSeedRegionFeatureData(args.visibleMap?.regionId, featureClassIds);

  return {
    source: 'mobile-question-center',
    gridResolutionMeters: 800,
    featureData,
    featureDataCoverage: featureData.length > 0 ? 'approximate_seed' : 'missing',
    questionTemplateId: args.template.templateId,
    questionCategoryId: args.template.categoryId,
    selectedRegionId: args.visibleMap?.regionId,
    answerSnapshot: args.question.answer
  };
}

export function describeTemplateSupport(args: {
  template: QuestionTemplateDefinition;
  category: QuestionCategoryDefinition;
  regionId?: string;
}): string {
  switch (args.category.resolverKind) {
    case 'photo_challenge':
      return 'Metadata-only manual evidence';
    case 'threshold_distance':
      return 'Approximate bounded geometry';
    case 'hotter_colder':
      return 'Exact or approximate from movement history';
    case 'nearest_feature_match':
    case 'comparative_distance':
    case 'nearest_candidate':
      return hasSeedFeatureCoverage(
        args.regionId,
        (args.template.featureClassRefs ?? []).map((feature) => feature.featureClassId)
      )
        ? 'Approximate seeded feature resolution'
        : 'Metadata-only until feature data is available';
    default:
      return 'Metadata-only fallback';
  }
}

export function getViewerRole(
  projection: MatchProjection | undefined,
  fallbackRole: MatchRole | undefined
): MatchRole {
  if (!projection) {
    return fallbackRole ?? 'spectator';
  }

  const hostPlayer = projection.players.find((player) => player.role === 'host');
  if (fallbackRole === 'host' || hostPlayer) {
    return fallbackRole ?? 'host';
  }

  return fallbackRole ?? 'spectator';
}

export interface QuestionFlowCapabilities {
  role: MatchRole;
  canPrepareFlow: boolean;
  canSeedMovement: boolean;
  canAskQuestions: boolean;
  canAnswerQuestions: boolean;
  canResolveQuestions: boolean;
}

export function getQuestionFlowCapabilities(role: MatchRole): QuestionFlowCapabilities {
  return {
    role,
    canPrepareFlow: role === 'host',
    canSeedMovement: role === 'host' || role === 'seeker',
    canAskQuestions: role === 'host' || role === 'seeker',
    canAnswerQuestions: role === 'host' || role === 'hider',
    canResolveQuestions: role === 'host'
  };
}
