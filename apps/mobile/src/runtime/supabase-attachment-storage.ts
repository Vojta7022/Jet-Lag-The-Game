import type {
  DomainCommand,
  OnlineAuthSession,
  VisibleAttachmentProjection
} from '../../../../packages/shared-types/src/index.ts';
import { SupabaseAttachmentStorageClient } from '../../../../packages/transport/src/index.ts';

import {
  buildAttachmentUploadCommandFromDraft,
  type LocalMediaAttachmentDraft
} from '../features/evidence/evidence-model.ts';

function inferFileExtension(fileName: string | undefined, mimeType: string | undefined): string {
  const name = fileName?.trim();
  if (name && name.includes('.')) return name.slice(name.lastIndexOf('.'));
  switch (mimeType) {
    case 'image/jpeg': return '.jpg';
    case 'image/png': return '.png';
    case 'image/webp': return '.webp';
    default: return '';
  }
}

function assertSafePathSegment(value: string, label: string): string {
  if (!/^[a-zA-Z0-9:_-]+$/.test(value)) {
    throw new Error(`${label} contains characters that are not allowed in attachment storage paths.`);
  }
  return value;
}

export function buildSupabaseAttachmentObjectPath(args: {
  matchId: string;
  attachmentId: string;
  visibilityScope: LocalMediaAttachmentDraft['visibilityScope'];
  playerId?: string;
  teamId?: string;
  fileName?: string;
  mimeType?: string;
}): string {
  const requestedExtension = inferFileExtension(args.fileName, args.mimeType);
  const extension = /^\.[a-z0-9]{1,8}$/i.test(requestedExtension) ? requestedExtension : '';
  const objectName = `${assertSafePathSegment(args.attachmentId, 'Attachment identity')}${extension}`;
  const base = ['matches', assertSafePathSegment(args.matchId, 'Match identity'), args.visibilityScope];

  if (args.visibilityScope === 'team_private') {
    if (!args.teamId) throw new Error('A team identity is required for team-private attachment storage.');
    base.push(assertSafePathSegment(args.teamId, 'Team identity'));
  } else if (args.visibilityScope === 'player_private' || args.visibilityScope === 'host_admin') {
    if (!args.playerId) throw new Error('A player identity is required for private attachment storage.');
    base.push(assertSafePathSegment(args.playerId, 'Player identity'));
  } else if (args.visibilityScope !== 'public_match') {
    throw new Error(`Attachments cannot be uploaded to the ${args.visibilityScope} scope.`);
  }

  return [...base, objectName].join('/');
}

async function readLocalAssetBody(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Could not read the selected local media file (${response.status}).`);
  }

  return response.blob();
}

export async function buildSupabaseAttachmentUploadCommand(args: {
  matchId: string;
  draft: LocalMediaAttachmentDraft;
  authSession: OnlineAuthSession;
  storageClient: SupabaseAttachmentStorageClient;
  bucket: string;
  cacheControlSeconds: number;
}): Promise<DomainCommand> {
  const body = await readLocalAssetBody(args.draft.uri);
  const objectPath = buildSupabaseAttachmentObjectPath({
    matchId: args.matchId,
    attachmentId: args.draft.attachmentId,
    visibilityScope: args.draft.visibilityScope,
    playerId: args.authSession.memberships.find((membership) =>
      membership.matchId === args.matchId && membership.playerId
    )?.playerId ?? args.authSession.defaultPlayerId,
    teamId: args.draft.teamId,
    fileName: args.draft.fileName,
    mimeType: args.draft.mimeType
  });
  const uploaded = await args.storageClient.uploadObject({
    bucket: args.bucket,
    objectPath,
    contentType: args.draft.mimeType,
    body,
    cacheControlSeconds: args.cacheControlSeconds,
    upsert: true,
    auth: {
      accessToken: args.authSession.accessToken
    }
  });

  return buildAttachmentUploadCommandFromDraft(args.draft, {
    captureMetadata: {
      storageState: 'supabase_object_stored',
      storageProvider: 'supabase',
      storageBucket: uploaded.bucket,
      storageObjectPath: uploaded.objectPath,
      storageUploadedAt: uploaded.uploadedAt,
      storageByteSize: uploaded.byteSize,
      storageRequiresAuthenticatedAccess: true
    }
  });
}

export interface RemoteAttachmentMediaSource {
  uri: string;
  headers?: Record<string, string>;
}

export function buildSupabaseAttachmentMediaSource(args: {
  attachment: VisibleAttachmentProjection;
  authSession: OnlineAuthSession | undefined;
  storageClient: SupabaseAttachmentStorageClient | undefined;
}): RemoteAttachmentMediaSource | undefined {
  const storage = args.attachment.storage;
  if (
    !storage ||
    storage.provider !== 'supabase' ||
    storage.storageState !== 'supabase_object_stored' ||
    !storage.bucket ||
    !storage.objectPath ||
    !args.storageClient
  ) {
    return undefined;
  }

  return {
    uri: args.storageClient.buildAuthenticatedObjectUrl({
      bucket: storage.bucket,
      objectPath: storage.previewObjectPath ?? storage.objectPath
    }),
    headers: args.storageClient.buildAccessHeaders({
      accessToken: args.authSession?.accessToken
    })
  };
}
