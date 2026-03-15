import type {
  AttachmentKind,
  DomainCommand,
  ProjectionScope,
  VisibleAttachmentProjection
} from '../../../../../packages/shared-types/src/index.ts';

export type LocalEvidenceContextKind = 'chat' | 'question' | 'card';
export type LocalMediaSource = 'camera' | 'library';
export type LocalMediaDraftStage = 'selected_local' | 'submitting_runtime' | 'submitted_runtime';

export interface SelectedMediaAsset {
  uri: string;
  source: LocalMediaSource;
  mimeType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
}

export interface LocalEvidenceContextDescriptor {
  contextId: string;
  kind: LocalEvidenceContextKind;
  title: string;
  detail: string;
  visibilityScope: ProjectionScope;
  attachmentKind: AttachmentKind;
  channelId?: string;
  questionInstanceId?: string;
  cardInstanceId?: string;
}

export interface LocalMediaAttachmentDraft {
  attachmentId: string;
  contextId: string;
  contextKind: LocalEvidenceContextKind;
  kind: AttachmentKind;
  label: string;
  note: string;
  visibilityScope: ProjectionScope;
  channelId?: string;
  questionInstanceId?: string;
  cardInstanceId?: string;
  source: LocalMediaSource;
  uri: string;
  mimeType?: string;
  fileName?: string;
  width?: number;
  height?: number;
  fileSizeBytes?: number;
  createdAt: string;
  stage: LocalMediaDraftStage;
}

export function createLocalMediaAttachmentDraft(args: {
  context: LocalEvidenceContextDescriptor;
  asset: SelectedMediaAsset;
  createId: () => string;
  createdAt?: string;
}): LocalMediaAttachmentDraft {
  const attachmentId = `attachment:${args.createId()}`;
  const fallbackLabel =
    args.asset.fileName?.trim() ||
    (args.context.kind === 'question'
      ? 'Question evidence image'
      : args.context.kind === 'card'
        ? 'Card evidence image'
        : 'Chat image');

  return {
    attachmentId,
    contextId: args.context.contextId,
    contextKind: args.context.kind,
    kind: args.context.attachmentKind,
    label: fallbackLabel,
    note: '',
    visibilityScope: args.context.visibilityScope,
    channelId: args.context.channelId,
    questionInstanceId: args.context.questionInstanceId,
    cardInstanceId: args.context.cardInstanceId,
    source: args.asset.source,
    uri: args.asset.uri,
    mimeType: args.asset.mimeType,
    fileName: args.asset.fileName,
    width: args.asset.width,
    height: args.asset.height,
    fileSizeBytes: args.asset.fileSizeBytes,
    createdAt: args.createdAt ?? new Date().toISOString(),
    stage: 'selected_local'
  };
}

export function buildAttachmentUploadCommandFromDraft(
  draft: LocalMediaAttachmentDraft
): DomainCommand {
  const label = draft.label.trim() || 'Untitled attachment';
  const note = draft.note.trim() || undefined;
  const metadata: Record<string, unknown> = {
    source:
      draft.contextKind === 'question'
        ? 'mobile-question-evidence'
        : draft.contextKind === 'card'
          ? 'mobile-card-evidence'
          : 'mobile-chat-media',
    pickerSource: draft.source,
    storageState: 'metadata_record_only',
    localPreviewAvailableInSession: true,
    selectedAt: draft.createdAt
  };

  if (draft.fileName) {
    metadata.fileName = draft.fileName;
  }

  if (draft.width !== undefined) {
    metadata.width = draft.width;
  }

  if (draft.height !== undefined) {
    metadata.height = draft.height;
  }

  if (draft.fileSizeBytes !== undefined) {
    metadata.fileSizeBytes = draft.fileSizeBytes;
  }

  return {
    type: 'upload_attachment',
    payload: {
      attachmentId: draft.attachmentId,
      kind: draft.kind,
      label,
      mimeType: draft.mimeType,
      note,
      visibilityScope: draft.visibilityScope,
      channelId: draft.channelId,
      questionInstanceId: draft.questionInstanceId,
      cardInstanceId: draft.cardInstanceId,
      captureMetadata: metadata
    }
  };
}

export function formatAttachmentVisibilityScope(scope: ProjectionScope): string {
  switch (scope) {
    case 'public_match':
      return 'Visible to everyone in the match';
    case 'team_private':
      return 'Visible to the linked team and host-admin';
    case 'player_private':
      return 'Visible only in the linked private player scope';
    case 'host_admin':
      return 'Visible to host-admin and authority views';
    case 'authority':
      return 'Visible only to authority views';
    default:
      return 'Visible in the current runtime scope';
  }
}

export function formatLocalMediaDraftStage(stage: LocalMediaDraftStage): string {
  switch (stage) {
    case 'selected_local':
      return 'Ready on this device';
    case 'submitting_runtime':
      return 'Recording in match state';
    case 'submitted_runtime':
      return 'Recorded in match state';
  }
}

export function describeVisibleAttachmentStatus(attachment: VisibleAttachmentProjection): string {
  if (attachment.status === 'linked') {
    return 'Visible in this conversation or flow';
  }

  return 'Recorded for review';
}

export function describeVisibleAttachmentDetail(attachment: VisibleAttachmentProjection): string {
  if (attachment.status === 'linked') {
    return 'This evidence record is linked to a visible message, question, or card flow. Image binaries may still stay local to the recording device until fuller storage support is added.';
  }

  return 'This evidence record exists in match state, but the image file may still need manual review or a later storage step before it is available on every device.';
}
