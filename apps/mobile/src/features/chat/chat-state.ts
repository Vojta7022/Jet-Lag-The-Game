import type {
  DomainCommand,
  MatchProjection,
  MatchRole,
  VisibleAttachmentProjection,
  VisibleChatChannelProjection,
  VisibleChatMessageProjection
} from '../../../../../packages/shared-types/src/index.ts';

import {
  buildAttachmentUploadCommandFromDraft,
  type LocalMediaAttachmentDraft
} from '../evidence/evidence-model.ts';
import {
  buildEvidenceContexts,
  type EvidenceContextViewModel
} from '../evidence/evidence-contexts.ts';

export { buildEvidenceContexts };

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
  draft: ChatComposerDraft,
  selectedAttachments?: LocalMediaAttachmentDraft[]
): boolean {
  if (!canSendMessage(role, channel)) {
    return false;
  }

  const body = draft.body.trim();
  const attachmentLabel = draft.attachmentLabel.trim();
  const attachmentNote = draft.attachmentNote.trim();
  const hasSelectedAttachments = (selectedAttachments ?? []).some(
    (attachment) => attachment.stage === 'selected_local'
  );

  if (body.length > 0) {
    return true;
  }

  return canSendAttachmentPlaceholders(role) && (
    hasSelectedAttachments ||
    attachmentLabel.length > 0 ||
    attachmentNote.length > 0
  );
}

export function buildChatSubmitCommands(args: {
  role: MatchRole;
  channel: VisibleChatChannelProjection | undefined;
  draft: ChatComposerDraft;
  createId: () => string;
  selectedAttachments?: LocalMediaAttachmentDraft[];
  preparedAttachmentCommands?: DomainCommand[];
}): DomainCommand[] {
  if (!args.channel || !canSubmitChatDraft(args.role, args.channel, args.draft, args.selectedAttachments)) {
    return [];
  }

  const commands: DomainCommand[] = [];
  const attachmentIds: string[] = [];
  const selectedAttachments = (args.selectedAttachments ?? []).filter(
    (attachment) => attachment.stage === 'selected_local'
  );
  const attachmentLabel = args.draft.attachmentLabel.trim();
  const attachmentNote = args.draft.attachmentNote.trim();

  if (args.preparedAttachmentCommands?.length) {
    commands.push(...args.preparedAttachmentCommands);
    for (const command of args.preparedAttachmentCommands) {
      if (command.type === 'upload_attachment') {
        attachmentIds.push(command.payload.attachmentId);
      }
    }
  } else {
    for (const attachment of selectedAttachments) {
      commands.push(buildAttachmentUploadCommandFromDraft(attachment));
      attachmentIds.push(attachment.attachmentId);
    }
  }

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
    return 'Recorded in match';
  }

  return 'Recorded and linked';
}

export function summarizeVisiblePhotoEvidence(
  attachments: VisibleAttachmentProjection[]
): string {
  if (attachments.length === 0) {
    return 'No visible placeholder attachments yet.';
  }

  return attachments.map((attachment) => attachment.attachmentId).join(', ');
}
