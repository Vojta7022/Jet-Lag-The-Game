import type { ProjectionScope } from '../content.ts';
import type { MatchRole } from './match.ts';

export type ChatChannelKind = 'lobby' | 'global' | 'team';

export type AttachmentKind = 'image' | 'photo_evidence' | 'file';

export type AttachmentStatus = 'placeholder_pending' | 'linked';

export interface ChatChannelModel {
  channelId: string;
  kind: ChatChannelKind;
  displayName: string;
  visibilityScope: ProjectionScope;
  teamId?: string;
  createdAt: string;
}

export interface ChatMessageModel {
  messageId: string;
  channelId: string;
  senderPlayerId?: string;
  senderDisplayName: string;
  senderRole: MatchRole;
  body: string;
  attachmentIds: string[];
  visibilityScope: ProjectionScope;
  teamId?: string;
  sentAt: string;
}

export interface AttachmentModel {
  attachmentId: string;
  kind: AttachmentKind;
  status: AttachmentStatus;
  label: string;
  mimeType?: string;
  visibilityScope: ProjectionScope;
  ownerPlayerId?: string;
  ownerTeamId?: string;
  channelId?: string;
  linkedQuestionInstanceId?: string;
  linkedCardInstanceId?: string;
  linkedMessageId?: string;
  note?: string;
  captureMetadata: Record<string, unknown>;
  createdAt: string;
}
