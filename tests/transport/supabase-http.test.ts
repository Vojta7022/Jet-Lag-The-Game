import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SupabaseAttachmentStorageClient,
  SupabaseRestTableClient
} from '../../packages/transport/src/index.ts';

test('supabase rest table client sends postgrest requests with expected query and auth headers', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined
    });

    return new Response(
      JSON.stringify([
        {
          matchId: 'match-1',
          revision: 3
        }
      ]),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }) as typeof fetch;

  try {
    const client = new SupabaseRestTableClient({
      baseUrl: 'https://example-project.supabase.co/',
      anonKey: 'anon-key-1'
    });

    await client.insert('matches', [{ matchId: 'match-1' }]);
    await client.upsert('matches', { matchId: 'match-1', revision: 3 }, ['matchId']);
    const rows = await client.selectMany<{ matchId: string; revision: number }>('matches', {
      matchId: 'match-1'
    });

    assert.equal(rows[0]?.matchId, 'match-1');
    assert.equal(calls.length, 3);
    assert.equal(calls[0]?.method, 'POST');
    assert.match(calls[0]!.url, /\/rest\/v1\/matches$/);
    assert.equal(calls[0]!.headers.get('apikey'), 'anon-key-1');
    assert.equal(calls[0]!.headers.get('authorization'), 'Bearer anon-key-1');
    assert.equal(calls[1]?.method, 'POST');
    assert.match(calls[1]!.url, /on_conflict=matchId/);
    assert.equal(calls[2]?.method, 'GET');
    assert.match(calls[2]!.url, /select=\*/);
    assert.match(calls[2]!.url, /matchId=eq\.match-1/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('supabase attachment storage client uploads and builds authenticated object access', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: Headers }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers)
    });

    return new Response('{}', {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }) as typeof fetch;

  try {
    const client = new SupabaseAttachmentStorageClient({
      baseUrl: 'https://example-project.supabase.co/',
      anonKey: 'anon-key-2'
    });

    const uploaded = await client.uploadObject({
      bucket: 'match-attachments',
      objectPath: 'matches/match-1/public_match/attachment-1.jpg',
      contentType: 'image/jpeg',
      body: new Blob(['hello'], { type: 'image/jpeg' }),
      cacheControlSeconds: 300,
      upsert: true,
      auth: {
        accessToken: 'access-token-2'
      }
    });

    assert.equal(uploaded.bucket, 'match-attachments');
    assert.equal(uploaded.objectPath, 'matches/match-1/public_match/attachment-1.jpg');
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'POST');
    assert.match(calls[0]!.url, /\/storage\/v1\/object\/match-attachments\/matches\/match-1\/public_match\/attachment-1\.jpg$/);
    assert.equal(calls[0]!.headers.get('authorization'), 'Bearer access-token-2');
    assert.equal(calls[0]!.headers.get('x-upsert'), 'true');
    assert.equal(
      client.buildAuthenticatedObjectUrl({
        bucket: 'match-attachments',
        objectPath: 'matches/match-1/public_match/attachment-1.jpg'
      }),
      'https://example-project.supabase.co/storage/v1/object/authenticated/match-attachments/matches/match-1/public_match/attachment-1.jpg'
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
