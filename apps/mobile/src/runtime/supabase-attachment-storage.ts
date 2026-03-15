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

function inferFileExtension(draft: LocalMediaAttachmentDraft): string {
  const name = draft.fileName?.trim();
  if (name && name.includes('.')) {
    return name.slice(name.lastIndexOf('.'));
  }

  switch (draft.mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
    default:
      return '';
  }
}

function buildObjectPath(matchId: string, draft: LocalMediaAttachmentDraft): string {
  return [
    'matches',
    matchId,
    draft.visibilityScope,
    `${draft.attachmentId}${inferFileExtension(draft)}`
  ].join('/');
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
  const objectPath = buildObjectPath(args.matchId, args.draft);
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
