import type {
  CardDefinition,
  ContentPack,
  DomainCommand,
  MatchProjection,
  MatchRole,
  ProjectionScope,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleAttachmentProjection,
  VisibleCardProjection,
  VisibleChatChannelProjection,
  VisibleChatMessageProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { findActiveQuestion, findQuestionCategory, findQuestionTemplate } from '../questions/question-catalog.ts';

export interface ChatComposerDraft {
  body: string;
  attachmentLabel: string;
  attachmentNote: string;
}

export interface ChatMessageViewModel {
  message: VisibleChatMessageProjection;
  attachments: VisibleAttachmentProjection[];
}

export interface ChatChannelViewModel {
  channel: VisibleChatChannelProjection;
  messages: ChatMessageViewModel[];
  unattachedPlaceholders: VisibleAttachmentProjection[];
}

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

const CHANNEL_KIND_ORDER: Record<VisibleChatChannelProjection['kind'], number> = {
  lobby: 0,
  global: 1,
  team: 2
};

export function createInitialChatComposerDraft(): ChatComposerDraft {
  return {
    body: '',
    attachmentLabel: '',
    attachmentNote: ''
  };
}

export function resolveChatViewerRole(
  role: string | undefined,
  scope: string | undefined
): MatchRole {
  if (role === 'host' || scope === 'host_admin') {
    return 'host';
  }

  if (role === 'hider') {
    return 'hider';
  }

  if (role === 'seeker') {
    return 'seeker';
  }

  return 'spectator';
}

function sortChannels(channels: VisibleChatChannelProjection[]): VisibleChatChannelProjection[] {
  return [...channels].sort((left, right) => {
    const kindCompare = (CHANNEL_KIND_ORDER[left.kind] ?? 99) - (CHANNEL_KIND_ORDER[right.kind] ?? 99);
    return kindCompare !== 0
      ? kindCompare
      : left.displayName.localeCompare(right.displayName);
  });
}

export function buildChatChannelViewModels(
  projection: MatchProjection | undefined
): ChatChannelViewModel[] {
  if (!projection) {
    return [];
  }

  const attachmentMap = new Map(
    projection.visibleAttachments.map((attachment) => [attachment.attachmentId, attachment])
  );

  return sortChannels(projection.visibleChatChannels).map((channel) => {
    const channelMessages = projection.visibleChatMessages
      .filter((message) => message.channelId === channel.channelId)
      .sort((left, right) => left.sentAt.localeCompare(right.sentAt))
      .map((message) => ({
        message,
        attachments: message.attachmentIds
          .map((attachmentId) => attachmentMap.get(attachmentId))
          .filter((attachment): attachment is VisibleAttachmentProjection => Boolean(attachment))
      }));

    const linkedAttachmentIds = new Set(
      channelMessages.flatMap((message) => message.attachments.map((attachment) => attachment.attachmentId))
    );

    return {
      channel,
      messages: channelMessages,
      unattachedPlaceholders: projection.visibleAttachments.filter(
        (attachment) =>
          attachment.channelId === channel.channelId &&
          !linkedAttachmentIds.has(attachment.attachmentId)
      )
    };
  });
}

export function pickDefaultChatChannelId(
  projection: MatchProjection | undefined,
  channels: ChatChannelViewModel[]
): string | undefined {
  if (channels.length === 0) {
    return undefined;
  }

  const preferredKind =
    projection?.lifecycleState === 'draft' ||
    projection?.lifecycleState === 'lobby' ||
    projection?.lifecycleState === 'role_assignment' ||
    projection?.lifecycleState === 'rules_confirmation' ||
    projection?.lifecycleState === 'map_setup'
      ? 'lobby'
      : 'global';

  return channels.find((entry) => entry.channel.kind === preferredKind)?.channel.channelId
    ?? channels[0]?.channel.channelId;
}

export function canSendAttachmentPlaceholders(role: MatchRole): boolean {
  return role === 'host' || role === 'hider' || role === 'seeker';
}

export function canSendMessage(
  role: MatchRole,
  channel: VisibleChatChannelProjection | undefined
): boolean {
  if (!channel) {
    return false;
  }

  if (role === 'host') {
    return true;
  }

  if (channel.visibilityScope === 'public_match') {
    return true;
  }

  return role === 'hider' || role === 'seeker';
}

export function canSubmitChatDraft(
  role: MatchRole,
  channel: VisibleChatChannelProjection | undefined,
  draft: ChatComposerDraft
): boolean {
  if (!canSendMessage(role, channel)) {
    return false;
  }

  const body = draft.body.trim();
  const attachmentLabel = draft.attachmentLabel.trim();
  const attachmentNote = draft.attachmentNote.trim();

  if (body.length > 0) {
    return true;
  }

  return canSendAttachmentPlaceholders(role) && (attachmentLabel.length > 0 || attachmentNote.length > 0);
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
    detail: 'Use manual placeholder attachments for the current photo-style question answer.',
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
    detail: 'This card currently needs manual photo evidence handling before later storage/upload work exists.',
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

export function buildChatSubmitCommands(args: {
  role: MatchRole;
  channel: VisibleChatChannelProjection | undefined;
  draft: ChatComposerDraft;
  createId: () => string;
}): DomainCommand[] {
  if (!args.channel || !canSubmitChatDraft(args.role, args.channel, args.draft)) {
    return [];
  }

  const commands: DomainCommand[] = [];
  const attachmentIds: string[] = [];
  const attachmentLabel = args.draft.attachmentLabel.trim();
  const attachmentNote = args.draft.attachmentNote.trim();

  if (canSendAttachmentPlaceholders(args.role) && (attachmentLabel.length > 0 || attachmentNote.length > 0)) {
    const attachmentId = `attachment:${args.createId()}`;
    commands.push({
      type: 'upload_attachment',
      payload: {
        attachmentId,
        kind: 'image',
        label: attachmentLabel || 'Image Placeholder',
        note: attachmentNote || undefined,
        visibilityScope: args.channel.visibilityScope,
        channelId: args.channel.channelId,
        captureMetadata: {
          source: 'mobile-chat-composer',
          placeholder: true
        }
      }
    });
    attachmentIds.push(attachmentId);
  }

  commands.push({
    type: 'send_chat_message',
    payload: {
      messageId: `message:${args.createId()}`,
      channelId: args.channel.channelId,
      body: args.draft.body.trim() || undefined,
      attachmentIds
    }
  });

  return commands;
}

export function buildEvidencePlaceholderCommand(args: {
  context: EvidenceContextViewModel;
  label: string;
  note?: string;
  createId: () => string;
}): DomainCommand | undefined {
  const label = args.label.trim();
  const note = args.note?.trim();
  if (label.length === 0 && (!note || note.length === 0)) {
    return undefined;
  }

  return {
    type: 'upload_attachment',
    payload: {
      attachmentId: `attachment:${args.createId()}`,
      kind: 'photo_evidence',
      label: label || 'Photo Evidence Placeholder',
      note: note || undefined,
      visibilityScope: args.context.suggestedVisibilityScope,
      questionInstanceId: args.context.questionInstanceId,
      cardInstanceId: args.context.cardInstanceId,
      captureMetadata: {
        source: 'mobile-chat-evidence',
        placeholder: true,
        contextKind: args.context.kind
      }
    }
  };
}

export function formatChannelScope(channel: VisibleChatChannelProjection): string {
  if (channel.kind === 'team') {
    return 'Team-private';
  }

  if (channel.kind === 'lobby') {
    return 'Lobby / public';
  }

  return 'Global / public';
}

export function formatAttachmentStatus(status: VisibleAttachmentProjection['status']): string {
  if (status === 'placeholder_pending') {
    return 'Placeholder only';
  }

  return 'Linked';
}

export function summarizeVisiblePhotoEvidence(
  attachments: VisibleAttachmentProjection[]
): string {
  if (attachments.length === 0) {
    return 'No visible placeholder attachments yet.';
  }

  return attachments.map((attachment) => attachment.attachmentId).join(', ');
}
