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
  attachmentKind: 'photo_evidence' | 'video_evidence';
  title: string;
  detail: string;
  questionInstanceId?: string;
  cardInstanceId?: string;
  suggestedVisibilityScope: ProjectionScope;
  teamId?: string;
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
    attachmentKind: 'photo_evidence',
    title: `Photo Evidence: ${template.name}`,
    detail: 'Pick or capture an image, then record the attachment metadata honestly in the match before submitting the answer.',
    questionInstanceId: question.questionInstanceId,
    suggestedVisibilityScope: category.resolverKind === 'photo_challenge'
      ? 'public_match'
      : resolveSuggestedEvidenceScope({
          role: args.role,
          teamId: question.targetTeamId
        }),
    teamId: question.targetTeamId,
    attachments
  };
}

function cardRequiresEvidence(card: CardDefinition): boolean {
  if (card.requirements?.requiresPhotoUpload || card.requirements?.requiresVideoUpload) {
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
  const cardInstanceId = args.projection.activeCardResolution?.sourceCardInstanceId ??
    args.projection.zoologistChallenge?.sourceCardInstanceId ??
    args.projection.luxuryCarChallenge?.sourceCardInstanceId ??
    args.projection.unguidedTouristChallenge?.sourceCardInstanceId;
  const challengeCardInstanceId = args.projection.birdGuideChallenge?.sourceCardInstanceId ??
    args.projection.mediocreTravelAgentChallenge?.sourceCardInstanceId;
  const resolvedCardInstanceId = cardInstanceId ?? challengeCardInstanceId;
  if (!resolvedCardInstanceId) {
    return undefined;
  }

  const activeCard = findVisibleCard(args.projection, resolvedCardInstanceId);
  const challengeEffectType = args.projection.zoologistChallenge
    ? 'zoologist_challenge'
    : args.projection.luxuryCarChallenge
      ? 'luxury_car_challenge'
      : args.projection.unguidedTouristChallenge
        ? 'unguided_tourist_challenge'
      : args.projection.birdGuideChallenge
        ? 'bird_guide_challenge'
      : args.projection.mediocreTravelAgentChallenge
        ? 'mediocre_travel_agent_challenge'
      : args.projection.activeCardResolution?.resolutionKind === 'unguided_tourist_challenge'
        ? 'unguided_tourist_challenge'
      : args.projection.activeCardResolution?.resolutionKind === 'bird_guide_challenge'
        ? 'bird_guide_challenge'
      : args.projection.activeCardResolution?.resolutionKind === 'mediocre_travel_agent_challenge'
        ? 'mediocre_travel_agent_challenge'
      : args.projection.activeCardResolution?.resolutionKind === 'labyrinth_challenge'
        ? 'labyrinth_challenge'
      : undefined;
  const definition = activeCard
    ? args.contentPack.cards.find((card) => card.cardDefinitionId === activeCard.cardDefinitionId)
    : challengeEffectType
      ? args.contentPack.cards.find((card) => card.effects.some((effect) => effect.effectType === challengeEffectType))
      : undefined;
  if (!definition || !cardRequiresEvidence(definition)) {
    return undefined;
  }

  const isPublicPhotoChallenge = definition.effects.some((effect) =>
    effect.effectType === 'labyrinth_challenge' || effect.effectType === 'zoologist_challenge' || effect.effectType === 'luxury_car_challenge' || effect.effectType === 'unguided_tourist_challenge' || effect.effectType === 'bird_guide_challenge' || effect.effectType === 'mediocre_travel_agent_challenge'
  );
  const detail = definition.effects.some((effect) => effect.effectType === 'labyrinth_challenge')
    ? 'Take a camera photo of the hand-drawn maze and record it publicly so the seekers can solve it.'
    : definition.effects.some((effect) => effect.effectType === 'zoologist_challenge')
    ? 'Capture and record a public photo for the Zoologist challenge. Players compare the animal category themselves.'
    : definition.effects.some((effect) => effect.effectType === 'luxury_car_challenge')
      ? 'Capture and record a new public car photo. The hider reviews the model and production-year MSRP.'
      : definition.effects.some((effect) => effect.effectType === 'unguided_tourist_challenge')
        ? (args.projection.unguidedTouristChallenge
            ? 'Seekers take a new public camera photo of the found structure. The hider reviews it; the app records the no-internet attestation.'
            : 'The hider shares a public Street View screenshot from their photo library. Keep the image unzoomed, level with the horizon, and show a human-built structure other than any part of a road, curb, or sidewalk.')
      : definition.effects.some((effect) => effect.effectType === 'bird_guide_challenge')
        ? 'Record a new bird video with the bird already in frame. The hider has one recording; seekers may retry until the hider approves a video at least as long.'
      : definition.effects.some((effect) => effect.effectType === 'mediocre_travel_agent_challenge')
        ? 'The seekers visit the named destination, stay there for the scale time, share at least three public camera photos, and acquire a physical souvenir. Phone locations time the visit; the hider chooses and attests the public place.'
      : 'Pick or capture supporting media, then record the attachment metadata honestly before the referee closes the card window.';

  const attachments = args.projection.visibleAttachments.filter(
    (attachment) => attachment.linkedCardInstanceId === resolvedCardInstanceId
  );

  return {
    contextId: `card:${resolvedCardInstanceId}`,
    kind: 'card',
    attachmentKind: definition.effects.some((effect) => effect.effectType === 'bird_guide_challenge') ? 'video_evidence' : 'photo_evidence',
    title: `Card Evidence: ${definition.name}`,
    detail,
    cardInstanceId: resolvedCardInstanceId,
    suggestedVisibilityScope: isPublicPhotoChallenge ? 'public_match' : resolveSuggestedEvidenceScope({
      role: args.role,
      teamId: activeCard?.holderType === 'team' ? activeCard?.holderId : undefined
    }),
    teamId: isPublicPhotoChallenge ? undefined : activeCard?.holderType === 'team' ? activeCard?.holderId : undefined,
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
