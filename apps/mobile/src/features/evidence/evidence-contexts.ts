import type {
  CardDefinition,
  ContentPack,
  MatchProjection,
  MatchRole,
  ProjectionScope,
  VisibleAttachmentProjection,
  VisibleCardProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { findActiveQuestion, findQuestionCategory, findQuestionTemplate } from '../questions/question-catalog.ts';

export interface EvidenceContextViewModel {
  contextId: string;
  kind: 'question' | 'card';
  title: string;
  detail: string;
  questionInstanceId?: string;
  cardInstanceId?: string;
  suggestedVisibilityScope: ProjectionScope;
  attachments: VisibleAttachmentProjection[];
}

function resolveSuggestedEvidenceScope(args: {
  role: MatchRole;
  teamId?: string;
  channelScope?: ProjectionScope;
}): ProjectionScope {
  if (args.teamId) {
    return 'team_private';
  }

  if (args.role === 'host') {
    return 'host_admin';
  }

  return args.channelScope ?? 'player_private';
}

function resolveQuestionEvidenceContext(args: {
  contentPack: ContentPack;
  projection: MatchProjection;
  role: MatchRole;
}): EvidenceContextViewModel | undefined {
  const question = findActiveQuestion(args.projection);
  if (!question) {
    return undefined;
  }

  const template = findQuestionTemplate(args.contentPack, question.templateId);
  const category = findQuestionCategory(args.contentPack, question.categoryId);
  if (!template || !category) {
    return undefined;
  }

  const expectsAttachmentAnswer =
    category.resolverKind === 'photo_challenge' ||
    String(template.answerSchema.kind ?? 'manual') === 'attachment';
  if (!expectsAttachmentAnswer) {
    return undefined;
  }

  const attachments = args.projection.visibleAttachments.filter(
    (attachment) => attachment.linkedQuestionInstanceId === question.questionInstanceId
  );

  return {
    contextId: `question:${question.questionInstanceId}`,
    kind: 'question',
    title: `Photo Evidence: ${template.name}`,
    detail: 'Pick or capture an image, then record the attachment metadata honestly in the match before submitting the answer.',
    questionInstanceId: question.questionInstanceId,
    suggestedVisibilityScope: resolveSuggestedEvidenceScope({
      role: args.role,
      teamId: question.targetTeamId
    }),
    attachments
  };
}

function cardRequiresPhotoEvidence(card: CardDefinition): boolean {
  if (card.requirements?.requiresPhotoUpload) {
    return true;
  }

  return (card.castingCost ?? []).some((requirement) => requirement.requirementType === 'photo') ||
    (card.preconditions ?? []).some((requirement) => requirement.requirementType === 'photo');
}

function findVisibleCard(
  projection: MatchProjection,
  cardInstanceId: string | undefined
): VisibleCardProjection | undefined {
  if (!cardInstanceId) {
    return undefined;
  }

  return projection.visibleCards.find((card) => card.cardInstanceId === cardInstanceId);
}

function resolveCardEvidenceContext(args: {
  contentPack: ContentPack;
  projection: MatchProjection;
  role: MatchRole;
}): EvidenceContextViewModel | undefined {
  const activeCard = findVisibleCard(args.projection, args.projection.activeCardResolution?.sourceCardInstanceId);
  if (!activeCard) {
    return undefined;
  }

  const definition = args.contentPack.cards.find(
    (card) => card.cardDefinitionId === activeCard.cardDefinitionId
  );
  if (!definition || !cardRequiresPhotoEvidence(definition)) {
    return undefined;
  }

  const attachments = args.projection.visibleAttachments.filter(
    (attachment) => attachment.linkedCardInstanceId === activeCard.cardInstanceId
  );

  return {
    contextId: `card:${activeCard.cardInstanceId}`,
    kind: 'card',
    title: `Card Evidence: ${definition.name}`,
    detail: 'Pick or capture supporting media, then record the attachment metadata honestly before the referee closes the card window.',
    cardInstanceId: activeCard.cardInstanceId,
    suggestedVisibilityScope: resolveSuggestedEvidenceScope({
      role: args.role,
      teamId: activeCard.holderType === 'team' ? activeCard.holderId : undefined
    }),
    attachments
  };
}

export function buildEvidenceContexts(
  contentPack: ContentPack,
  projection: MatchProjection | undefined,
  role: MatchRole
): EvidenceContextViewModel[] {
  if (!projection) {
    return [];
  }

  return [
    resolveQuestionEvidenceContext({ contentPack, projection, role }),
    resolveCardEvidenceContext({ contentPack, projection, role })
  ].filter((context): context is EvidenceContextViewModel => Boolean(context));
}
