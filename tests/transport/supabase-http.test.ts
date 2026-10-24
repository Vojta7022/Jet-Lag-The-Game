import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SupabaseAttachmentStorageClient,
  SupabaseRestTableClient
} from '../../packages/transport/src/index.ts';
import { EdgeFunctionOnlineService } from '../../packages/transport/src/online/edge-function-service.ts';

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

test('supabase rest table client invokes an RPC with its JSON payload and decodes the result', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; method: string; headers: Headers; body?: string }> = [];

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined
    });
    return new Response(JSON.stringify({ status: 'committed', committedRevision: 2 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  }) as typeof fetch;

  try {
    const client = new SupabaseRestTableClient({
      baseUrl: 'https://example-project.supabase.co',
      anonKey: 'server-secret-1'
    });
    const result = await client.rpc<{ status: string; committedRevision: number }>(
      'commit_match_revision',
      { p_payload: { matchId: 'match-1', expectedRevision: 1 } }
    );

    assert.deepEqual(result, { status: 'committed', committedRevision: 2 });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.method, 'POST');
    assert.equal(calls[0]?.url, 'https://example-project.supabase.co/rest/v1/rpc/commit_match_revision');
    assert.equal(calls[0]?.headers.get('authorization'), 'Bearer server-secret-1');
    assert.deepEqual(JSON.parse(calls[0]!.body ?? '{}'), { p_payload: { matchId: 'match-1', expectedRevision: 1 } });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('supabase rest table client rejects RPC path injection', async () => {
  const client = new SupabaseRestTableClient({
    baseUrl: 'https://example-project.supabase.co',
    anonKey: 'server-secret-1'
  });
  await assert.rejects(client.rpc('commit_match_revision/extra', {}), { code: 'SUPABASE_RPC_NAME_INVALID' });
});

test('supabase rest table client updates a scoped server-owned row', async () => {
  const originalFetch = globalThis.fetch;
  let captured: { url: string; method: string; body?: string } | undefined;
  globalThis.fetch = (async (input, init) => {
    captured = { url: String(input), method: init?.method ?? 'GET', body: String(init?.body ?? '') };
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  try {
    const client = new SupabaseRestTableClient({ baseUrl: 'https://project.supabase.co', anonKey: 'service-role-key' });
    await client.update('match_memberships', { matchId: 'm1', authUserId: 'u1', status: 'active' }, { status: 'removed' });
    assert.equal(captured?.method, 'PATCH');
    assert.match(captured?.url ?? '', /matchId=eq\.m1/);
    assert.match(captured?.url ?? '', /authUserId=eq\.u1/);
    assert.deepEqual(JSON.parse(captured?.body ?? '{}'), { status: 'removed' });
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

test('Edge Function service sends the user JWT and maps create and join operations', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const service = new EdgeFunctionOnlineService({
    projectUrl: 'https://project.supabase.co/',
    anonKey: 'publishable-key',
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      const body = calls.length === 2
        ? { matchId: 'server-match-id', result: { accepted: true, matchId: 'server-match-id', commandId: 'join-1', events: [] } }
        : { matchId: 'created-match', joinCode: 'ABC123', result: { accepted: true, matchId: 'created-match', commandId: 'create-1', events: [] } };
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });
  const session = {
    authProvider: 'supabase' as const,
    authSessionId: 'auth-session',
    authUserId: 'auth-user',
    accessToken: 'user-jwt',
    memberships: []
  };

  const created = await service.submitAuthenticatedCommand(session, {
    matchId: 'created-match', commandId: 'create-1', occurredAt: '2026-10-24T12:00:00.000Z',
    idempotencyKey: 'create-idem',
    command: { type: 'create_match', payload: { mode: 'online', contentPackId: 'pack-v1', hostPlayerId: 'host-1', hostDisplayName: 'Host' } }
  });
  const joined = await service.submitAuthenticatedCommand(session, {
    matchId: 'temporary-client-id', joinCode: 'ABC123', commandId: 'join-1', occurredAt: '2026-10-24T12:00:01.000Z',
    idempotencyKey: 'join-idem',
    command: { type: 'join_match', payload: { playerId: 'seeker-1', displayName: 'Seeker' } }
  });

  assert.equal(created.joinCode, 'ABC123');
  assert.equal(joined.matchId, 'server-match-id');
  assert.equal(calls[0]?.url, 'https://project.supabase.co/functions/v1/game-authority');
  assert.equal(new Headers(calls[0]?.init?.headers).get('authorization'), 'Bearer user-jwt');
  assert.equal(new Headers(calls[0]?.init?.headers).get('apikey'), 'publishable-key');
  assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
    operation: 'create_match', matchId: 'created-match', commandId: 'create-1',
    occurredAt: '2026-10-24T12:00:00.000Z', idempotencyKey: 'create-idem',
    payload: { mode: 'online', contentPackId: 'pack-v1', hostPlayerId: 'host-1', hostDisplayName: 'Host' }
  });
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    operation: 'join_match', joinCode: 'ABC123', commandId: 'join-1',
    occurredAt: '2026-10-24T12:00:01.000Z', idempotencyKey: 'join-idem',
    payload: { playerId: 'seeker-1', displayName: 'Seeker' }
  });
});

test('Edge Function service surfaces revision conflicts and does not retry writes', async () => {
  let writes = 0;
  const service = new EdgeFunctionOnlineService({
    projectUrl: 'https://project.supabase.co', anonKey: 'publishable-key',
    fetch: async () => {
      writes += 1;
      return new Response(JSON.stringify({ code: 'MATCH_REVISION_CONFLICT', error: 'Refresh', currentRevision: 12 }), {
        status: 409, headers: { 'content-type': 'application/json' }
      });
    }
  });
  const session = { authProvider: 'supabase' as const, authSessionId: 's', authUserId: 'u', accessToken: 'jwt', memberships: [] };

  await assert.rejects(
    service.submitAuthenticatedCommand(session, {
      matchId: 'm1', commandId: 'c1', occurredAt: '2026-10-24T12:00:00.000Z',
      command: { type: 'start_match', payload: {} }
    }),
    (error: unknown) => error instanceof Error
      && 'code' in error && error.code === 'MATCH_REVISION_CONFLICT'
      && 'currentRevision' in error && error.currentRevision === 12
  );
  assert.equal(writes, 1);
});

test('Edge Function service retries a safe projection read after a transient server error', async () => {
  let reads = 0;
  const service = new EdgeFunctionOnlineService({
    projectUrl: 'https://project.supabase.co', anonKey: 'publishable-key',
    fetch: async () => {
      reads += 1;
      return reads === 1
        ? new Response('{"error":"temporary"}', { status: 503 })
        : new Response(JSON.stringify({ sync: { matchId: 'm1' } }), { status: 200 });
    }
  });
  const session = { authProvider: 'supabase' as const, authSessionId: 's', authUserId: 'u', accessToken: 'jwt', memberships: [] };

  const sync = await service.requestAuthenticatedSnapshot(session, { matchId: 'm1', requestedScope: 'public_match' });
  assert.equal(sync.matchId, 'm1');
  assert.equal(reads, 2);
});
