import assert from 'node:assert/strict';
import test from 'node:test';

import type { OnlineTransportService } from '../../packages/transport/src/online/contracts.ts';
import type { CommandSubmissionResult, MatchMembershipRecord, OnlineAuthSession } from '../../packages/shared-types/src/index.ts';
import { createGameAuthorityHandler } from '../../supabase/functions/game-authority/index.ts';
import { loadEngineTestContentPack } from '../engine/helpers.ts';
import {
  InMemoryOnlineAuthorityRepository,
  InMemorySupabaseTableClient,
  OnlineAuthorityRuntime,
  SupabaseContentPackReferenceRepository,
  SupabaseEventRepository,
  SupabaseMatchRepository,
  SupabaseProjectionRepository,
  SupabaseSnapshotRepository
} from '../../packages/transport/src/index.ts';

function dependencies() {
  const calls: Array<{ operation: string; session: OnlineAuthSession; payload: unknown }> = [];
  const memberships = new Map<string, MatchMembershipRecord>();
  const service: OnlineTransportService = {
    async submitAuthenticatedCommand(session, request) {
      calls.push({ operation: 'command', session, payload: request });
      return { accepted: true, matchId: request.matchId, commandId: request.commandId } as CommandSubmissionResult;
    },
    async requestAuthenticatedSnapshot(session, request) {
      calls.push({ operation: 'snapshot', session, payload: request });
      return {} as never;
    },
    async catchUpAuthenticated(session, request) {
      calls.push({ operation: 'catch_up', session, payload: request });
      return {} as never;
    },
    async reconnectAuthenticated(session, request) {
      calls.push({ operation: 'reconnect', session, payload: request });
      return {} as never;
    }
  };
  const handler = createGameAuthorityHandler({
    auth: {
      async getUser(accessToken) {
        return accessToken === 'valid-token' ? { id: 'auth-user-1' }
          : accessToken === 'second-token' ? { id: 'auth-user-2' }
            : undefined;
      }
    },
    memberships: {
      async find(matchId, authUserId) {
        return memberships.get(`${matchId}:${authUserId}`);
      },
      async bind(record) {
        const key = `${record.matchId}:${record.authUserId}`;
        const existing = memberships.get(key);
        if (existing && (existing.playerId !== record.playerId || existing.status !== 'active')) {
          throw Object.assign(new Error('identity is already bound'), { code: 'PLAYER_ALREADY_JOINED' });
        }
        memberships.set(key, record);
      }
    },
    matches: {
      async findByJoinCode(joinCode) { return joinCode === 'AB12CD' ? 'm1' : undefined; }
    },
    service
  });
  return { handler, calls, memberships };
}

function request(body: unknown, token?: string): Request {
  return new Request('https://game.example.test/game-authority', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

test('game authority requires a bearer token and rejects invalid Supabase users', async () => {
  const { handler } = dependencies();
  const missing = await handler(request({ operation: 'snapshot', matchId: 'm1' }));
  const invalid = await handler(request({ operation: 'snapshot', matchId: 'm1' }, 'bad-token'));

  assert.equal(missing.status, 401);
  assert.equal((await missing.json()).code, 'AUTH_REQUIRED');
  assert.equal(invalid.status, 401);
  assert.equal((await invalid.json()).code, 'AUTH_INVALID');
});

test('valid Auth user can create a match and receives an immutable host membership', async () => {
  const { handler, calls, memberships } = dependencies();
  const response = await handler(request({
    operation: 'create_match',
    matchId: 'm1',
    commandId: 'c1',
    occurredAt: '2026-10-24T12:00:00.000Z',
    idempotencyKey: 'i1',
    payload: { mode: 'online', contentPackId: 'pack-v1', hostPlayerId: 'host-1', hostDisplayName: 'Host' }
  }, 'valid-token'));

  assert.equal(response.status, 200);
  assert.equal(calls[0]?.session.authUserId, 'auth-user-1');
  assert.equal(calls[0]?.session.defaultPlayerId, 'host-1');
  assert.equal(memberships.get('m1:auth-user-1')?.playerId, 'host-1');
});

test('joining with a second Auth user binds only that user to the chosen player', async () => {
  const { handler, calls, memberships } = dependencies();
  const response = await handler(request({
    operation: 'join_match',
    joinCode: 'AB12CD',
    commandId: 'c2',
    occurredAt: '2026-10-24T12:01:00.000Z',
    payload: { playerId: 'seeker-1', displayName: 'Seeker' }
  }, 'second-token'));

  assert.equal(response.status, 200);
  assert.equal(calls[0]?.session.authUserId, 'auth-user-2');
  assert.equal(memberships.get('m1:auth-user-2')?.playerId, 'seeker-1');
});

test('a non-member cannot read snapshots and request identity or role claims are rejected', async () => {
  const { handler, calls } = dependencies();
  const denied = await handler(request({ operation: 'snapshot', matchId: 'm1' }, 'valid-token'));
  const spoofed = await handler(request({
    operation: 'command', matchId: 'm1', commandId: 'c3', occurredAt: '2026-10-24T12:00:00.000Z',
    actorId: 'victim', role: 'host', playerId: 'victim',
    command: { type: 'start_match', payload: {} }
  }, 'valid-token'));

  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).code, 'MATCH_MEMBERSHIP_REQUIRED');
  assert.equal(spoofed.status, 400);
  assert.equal((await spoofed.json()).code, 'IDENTITY_CLAIMS_NOT_ALLOWED');
  assert.equal(calls.length, 0);
});

test('command parser rejects malformed operations instead of forwarding identity fields', async () => {
  const { handler, calls, memberships } = dependencies();
  memberships.set('m1:auth-user-1', {
    matchId: 'm1', authUserId: 'auth-user-1', playerId: 'player-1',
    joinedAt: '2026-10-24T12:00:00.000Z', status: 'active'
  });
  const unsupported = await handler(request({ operation: 'purge', matchId: 'm1' }, 'valid-token'));
  const badShape = await handler(request({
    operation: 'command', matchId: 'm1', commandId: 'c4', occurredAt: 'bad-time', command: null
  }, 'valid-token'));

  assert.equal(unsupported.status, 400);
  assert.equal(badShape.status, 400);
  assert.equal(calls.length, 0);
});

test('the handler reads a server-built projection and denies non-members without another commit', async () => {
  const contentPack = loadEngineTestContentPack();
  const tableClient = new InMemorySupabaseTableClient();
  const matches = new SupabaseMatchRepository(tableClient);
  const projections = new SupabaseProjectionRepository(tableClient);
  const authority = new class extends InMemoryOnlineAuthorityRepository {
    commitCount = 0;
    override async commit(input: Parameters<InMemoryOnlineAuthorityRepository['commit']>[0]) {
      this.commitCount += 1;
      return super.commit(input);
    }
  }();
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack],
    repositories: {
      matches,
      events: new SupabaseEventRepository(tableClient),
      snapshots: new SupabaseSnapshotRepository(tableClient),
      projections,
      contentPackReferences: new SupabaseContentPackReferenceRepository(tableClient)
    },
    authorityRepository: authority,
    realtimeFanout: {
      async publish() {},
      async subscribe() { return { subscriptionId: 'test', async unsubscribe() {} }; }
    }
  });
  const memberships = new Map<string, MatchMembershipRecord>();
  const handler = createGameAuthorityHandler({
    auth: { async getUser(token) { return token === 'host-token' ? { id: 'auth-host' } : token === 'guest-token' ? { id: 'auth-guest' } : undefined; } },
    memberships: {
      async find(matchId, authUserId) { return memberships.get(`${matchId}:${authUserId}`); },
      async bind(record) { memberships.set(`${record.matchId}:${record.authUserId}`, record); }
    },
    matches: { async findByJoinCode() { return undefined; } },
    service: runtime,
    now: () => '2026-10-24T12:00:00.000Z'
  });

  const created = await handler(request({
    operation: 'create_match', matchId: 'handler-authority-match', commandId: 'create-1',
    occurredAt: '2026-10-24T12:00:00.000Z',
    payload: {
      mode: 'online', contentPackId: contentPack.packId, hostPlayerId: 'host-1',
      hostDisplayName: 'Host', initialScale: 'small'
    }
  }, 'host-token'));
  const deniedCommand = await handler(request({
    operation: 'command', matchId: 'handler-authority-match', commandId: 'invalid-start',
    occurredAt: '2026-10-24T12:00:01.000Z',
    command: { type: 'start_match', payload: {} }
  }, 'host-token'));
  const snapshot = await handler(request({ operation: 'snapshot', matchId: 'handler-authority-match' }, 'host-token'));
  const denied = await handler(request({ operation: 'snapshot', matchId: 'handler-authority-match' }, 'guest-token'));

  assert.equal(created.status, 200);
  assert.equal((await deniedCommand.json()).result.accepted, false);
  assert.equal(snapshot.status, 200);
  assert.equal((await snapshot.json()).sync.projectionDelivery.projectionScope, 'host_admin');
  assert.equal(denied.status, 403);
  assert.equal(authority.commitCount, 1);
});
