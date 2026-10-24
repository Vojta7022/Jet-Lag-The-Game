import assert from 'node:assert/strict';
import test from 'node:test';

import type { OnlineTransportService } from '../../packages/transport/src/online/contracts.ts';
import type { CommandSubmissionResult, MatchMembershipRecord, OnlineAuthSession } from '../../packages/shared-types/src/index.ts';
import { createGameAuthorityHandler } from '../../supabase/functions/game-authority/index.ts';
import { loadEngineTestContentPack, makeEnvelope } from '../engine/helpers.ts';
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
import { EdgeFunctionOnlineService, MockOnlineRealtimeFanout, SupabaseOnlineTransportAdapter } from '../../packages/transport/src/index.ts';

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
      },
      async removePlayer(matchId, playerId) {
        for (const [key, membership] of memberships) {
          if (membership.matchId === matchId && membership.playerId === playerId && membership.status === 'active') {
            memberships.set(key, { ...membership, status: 'removed' });
          }
        }
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

test('reconnect reuses the authenticated player binding and rejects changing player identity', async () => {
  const { handler, calls, memberships } = dependencies();
  const joinBody = {
    operation: 'join_match', joinCode: 'AB12CD', commandId: 'join-retry',
    occurredAt: '2026-10-24T12:01:00.000Z', payload: { playerId: 'seeker-1', displayName: 'Seeker' }
  };
  const first = await handler(request(joinBody, 'second-token'));
  const reconnect = await handler(request({ ...joinBody, commandId: 'reconnect-command' }, 'second-token'));
  const changedPlayer = await handler(request({
    ...joinBody, payload: { playerId: 'different-player', displayName: 'Seeker' }
  }, 'second-token'));

  assert.equal(first.status, 200);
  assert.equal(reconnect.status, 200);
  assert.equal((await reconnect.json()).result.accepted, true);
  assert.equal(changedPlayer.status, 409);
  assert.equal((await changedPlayer.json()).code, 'PLAYER_ALREADY_JOINED');
  assert.equal(calls.filter((call) => call.operation === 'command').length, 1);
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
      async bind(record) { memberships.set(`${record.matchId}:${record.authUserId}`, record); },
      async removePlayer(matchId, playerId) {
        for (const [key, membership] of memberships) {
          if (membership.matchId === matchId && membership.playerId === playerId && membership.status === 'active') {
            memberships.set(key, { ...membership, status: 'removed' });
          }
        }
      }
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

test('two authenticated phone adapters create and join online and receive separate scoped projections', async () => {
  const contentPack = loadEngineTestContentPack();
  const tableClient = new InMemorySupabaseTableClient();
  const repositories = {
    matches: new SupabaseMatchRepository(tableClient),
    events: new SupabaseEventRepository(tableClient),
    snapshots: new SupabaseSnapshotRepository(tableClient),
    projections: new SupabaseProjectionRepository(tableClient),
    contentPackReferences: new SupabaseContentPackReferenceRepository(tableClient)
  };
  const authority = new class extends InMemoryOnlineAuthorityRepository {
    override async commit(input: Parameters<InMemoryOnlineAuthorityRepository['commit']>[0]) {
      const result = await super.commit(input);
      if (result.status === 'committed') {
        await repositories.matches.save(input.match);
        await repositories.events.append(input.matchId, input.events);
        await repositories.snapshots.save(input.snapshot);
        await repositories.projections.saveMany(input.projections);
      }
      return result;
    }
  }();
  const runtime = new OnlineAuthorityRuntime({
    contentPacks: [contentPack], repositories, authorityRepository: authority,
    realtimeFanout: new MockOnlineRealtimeFanout()
  });
  const handler = createGameAuthorityHandler({
    auth: { async getUser(token) { return token === 'host-jwt' ? { id: 'auth-host' } : token === 'seeker-jwt' ? { id: 'auth-seeker' } : undefined; } },
    memberships: {
      find: (matchId, authUserId) => authority.findMembership(matchId, authUserId),
      bind: (record) => authority.bindMembership(record),
      removePlayer: (matchId, playerId) => authority.removeMembership(matchId, playerId)
    },
    matches: {
      async findByJoinCode(joinCode) { return (await repositories.matches.getByJoinCode(joinCode))?.matchId; },
      async findJoinCodeByMatchId(matchId) { return (await repositories.matches.getByMatchId(matchId))?.joinCode; }
    },
    service: runtime
  });
  const edgeFetch: typeof fetch = async (input, init) => handler(new Request(String(input), init));
  const service = new EdgeFunctionOnlineService({ projectUrl: 'https://unit.test', anonKey: 'publishable', fetch: edgeFetch });
  const hostTransport = new SupabaseOnlineTransportAdapter(service, new MockOnlineRealtimeFanout());
  const matchId = 'two-phone-match';
  const hostRecipient = { recipientId: 'host_admin:host-1', actorId: 'auth-host', playerId: 'host-1', role: 'host' as const, scope: 'host_admin' as const };
  const hostSession: OnlineAuthSession = {
    authProvider: 'supabase', authSessionId: 'host-session', authUserId: 'auth-host',
    defaultPlayerId: 'host-1', accessToken: 'host-jwt', memberships: []
  };
  await hostTransport.connect({ sessionId: 'host-phone', recipient: hostRecipient, authSession: hostSession });
  const created = await hostTransport.submit(makeEnvelope(matchId, {
    actorId: 'auth-host', playerId: 'host-1', role: 'host'
  }, {
    type: 'create_match', payload: {
      mode: 'online', contentPackId: contentPack.packId, hostPlayerId: 'host-1',
      hostDisplayName: 'Host', initialScale: 'small'
    }
  }, 1));
  const hostSync = await hostTransport.requestSnapshot({ matchId });

  const seekerSession: OnlineAuthSession = {
    authProvider: 'supabase', authSessionId: 'seeker-session', authUserId: 'auth-seeker',
    defaultPlayerId: 'seeker-1', accessToken: 'seeker-jwt', memberships: []
  };
  const seekerTransport = new SupabaseOnlineTransportAdapter(service, new MockOnlineRealtimeFanout());
  await seekerTransport.connect({
    sessionId: 'seeker-phone',
    recipient: { recipientId: 'player_private:seeker-1', actorId: 'auth-seeker', playerId: 'seeker-1', role: 'spectator', scope: 'player_private' },
    authSession: seekerSession,
    joinCode: created.joinCode
  });
  const joined = await seekerTransport.submit(makeEnvelope('join-request-placeholder', {
    actorId: 'auth-seeker', playerId: 'seeker-1', role: 'spectator'
  }, { type: 'join_match', payload: { playerId: 'seeker-1', displayName: 'Seeker' } }, 2));
  const seekerSync = await seekerTransport.requestSnapshot({ matchId: joined.matchId });

  assert.equal(created.accepted, true);
  assert.match(created.joinCode ?? '', /^[A-Z0-9]{6}$/);
  assert.equal(joined.matchId, matchId);
  assert.equal(hostSync.projectionScope, 'host_admin');
  assert.equal(hostSync.projectionDelivery.recipient.playerId, 'host-1');
  assert.equal(seekerSync.projectionScope, 'player_private');
  assert.equal(seekerSync.projectionDelivery.recipient.playerId, 'seeker-1');
  assert.equal('aggregate' in hostSync.projectionDelivery.projection, false);
  assert.equal('aggregate' in seekerSync.projectionDelivery.projection, false);

  const removed = await hostTransport.submit(makeEnvelope(matchId, {
    actorId: 'auth-host', playerId: 'host-1', role: 'host'
  }, { type: 'remove_match_player', payload: { playerId: 'seeker-1' } }, 2));
  assert.equal(removed.accepted, true, JSON.stringify(removed.rejection));
  assert.equal((await authority.findMembership(matchId, 'auth-seeker'))?.status, 'removed');
  await assert.rejects(seekerTransport.requestSnapshot({ matchId }), (error: unknown) =>
    error instanceof Error && 'code' in error && error.code === 'MATCH_MEMBERSHIP_REQUIRED'
  );
});
