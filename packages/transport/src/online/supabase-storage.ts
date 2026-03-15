import { TransportRuntimeError } from '../errors.ts';

import type {
  SupabaseRequestAuthContext,
  SupabaseStorageClient,
  SupabaseStorageUploadResult
} from './contracts.ts';

function encodeObjectPath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function resolveByteSize(body: Blob | ArrayBuffer | Uint8Array): number | undefined {
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body.size;
  }

  if (body instanceof ArrayBuffer) {
    return body.byteLength;
  }

  if (body instanceof Uint8Array) {
    return body.byteLength;
  }

  return undefined;
}

function toRequestBody(body: Blob | ArrayBuffer | Uint8Array): Blob | ArrayBuffer {
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    const bytes = new Uint8Array(body.byteLength);
    bytes.set(new Uint8Array(body.buffer, body.byteOffset, body.byteLength));
    return new Blob([bytes]);
  }

  return new ArrayBuffer(0);
}

export interface SupabaseAttachmentStorageClientOptions {
  baseUrl: string;
  anonKey: string;
}

export class SupabaseAttachmentStorageClient implements SupabaseStorageClient {
  private readonly baseUrl: string;
  private readonly anonKey: string;

  constructor(options: SupabaseAttachmentStorageClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.anonKey = options.anonKey;
  }

  async uploadObject(args: {
    bucket: string;
    objectPath: string;
    contentType?: string;
    body: Blob | ArrayBuffer | Uint8Array;
    cacheControlSeconds?: number;
    upsert?: boolean;
    auth?: SupabaseRequestAuthContext;
  }): Promise<SupabaseStorageUploadResult> {
    const url = `${this.baseUrl}/storage/v1/object/${encodeObjectPath(args.bucket)}/${encodeObjectPath(args.objectPath)}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        ...this.buildAccessHeaders(args.auth),
        'Content-Type': args.contentType ?? 'application/octet-stream',
        'x-upsert': args.upsert ? 'true' : 'false',
        ...(args.cacheControlSeconds !== undefined
          ? { 'cache-control': `max-age=${args.cacheControlSeconds}` }
          : undefined)
      },
      body: toRequestBody(args.body)
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new TransportRuntimeError(
        'SUPABASE_STORAGE_UPLOAD_FAILED',
        `Supabase storage upload failed (${response.status}).${detail ? ` ${detail}` : ''}`
      );
    }

    return {
      bucket: args.bucket,
      objectPath: args.objectPath,
      uploadedAt: new Date().toISOString(),
      byteSize: resolveByteSize(args.body)
    };
  }

  buildAuthenticatedObjectUrl(args: { bucket: string; objectPath: string }): string {
    return `${this.baseUrl}/storage/v1/object/authenticated/${encodeObjectPath(args.bucket)}/${encodeObjectPath(args.objectPath)}`;
  }

  buildAccessHeaders(auth?: SupabaseRequestAuthContext): Record<string, string> {
    return {
      apikey: this.anonKey,
      Authorization: `Bearer ${auth?.accessToken ?? this.anonKey}`
    };
  }
}
