import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CommandEnvelope,
  DomainEventEnvelope,
  MatchAggregate,
  MatchMembershipRecord,
  MatchRecord,
  OnlineCommandCommit,
  OnlineCommandCommitResult
} from '../../packages/shared-types/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';
import {
  createMatchSnapshot,
  EngineCommandGateway,
  InMemoryOnlineAuthorityRepository,
  SupabaseOnlineAuthorityRepository
} from '../../packages/transport/src/index.ts';
import type { SupabaseTableClient } from '../../packages/transport/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope } from '../engine/helpers.ts';

const contentPack = loadEngineTestContentPack();

function createMatch() {
  const envelope = makeEnvelope('atomic-match', { actorId: 'auth-host', playerId: 'host', role: 'host' }, {
    type: 'create_match',
    payload: {
      mode: 'online',
      contentPackId: contentPack.packId,
      hostPlayerId: 'host',
      hostDisplayName: 'Host',
      initialScale: 'small'
    }
  }, 1);
  const execution = executeCommand(undefined, envelope, contentPack);
  return makeCommit(envelope, execution.aggregate, execution.events, null);
}

function makeCommit(
  envelope: CommandEnvelope,
  aggregate: MatchAggregate,
  events: DomainEventEnvelope[],
  expectedRevision: number | null,
  idempotencyKey = envelope.idempotencyKey!
): OnlineCommandCommit {
  const snapshot = createMatchSnapshot(aggregate, 'online_cloud');
  const match: MatchRecord = {
    matchId: aggregate.matchId,
    mode: aggregate.mode,
    lifecycleState: aggregate.lifecycleState,
    revision: aggregate.revision,
    contentPackId: aggregate.contentPackId,
    createdByPlayerId: aggregate.createdByPlayerId,
    selectedRulesetId: aggregate.selectedRulesetId,
    selectedScale: aggregate.selectedScale,
    createdAt: aggregate.createdAt,
    updatedAt: aggregate.updatedAt
  };
  const result = {
    accepted: true,
    matchId: aggregate.matchId,
    commandId: envelope.commandId,
    aggregate,
    aggregateRevision: aggregate.revision,
    events,
    snapshot
  };

  return {
    matchId: aggregate.matchId,
    expectedRevision,
    commandId: envelope.commandId,
    idempotencyKey,
    match,
    events,
    snapshot,
    projections: [],
    result
  };
}

function joinCommit(aggregate: MatchAggregate, playerId: string, step: number, expectedRevision: number) {
  const envelope = makeEnvelope(aggregate.matchId, { actorId: `auth-${playerId}`, role: 'spectator' }, {
    type: 'join_match',
    payload: { playerId, displayName: playerId }
  }, step);
  const execution = executeCommand(aggregate, envelope, contentPack);
  return makeCommit(envelope, execution.aggregate, execution.events, expectedRevision);
}

test('atomic match commit accepts creation and the next matching revision', async () => {
  const store = new InMemoryOnlineAuthorityRepository();
  const created = createMatch();

  const first = await store.commit(created);
  const secondCommit = joinCommit(created.snapshot.aggregate, 'seeker-1', 2, created.snapshot.snapshotVersion);
  const second = await store.commit(secondCommit);

  assert.equal(first.status, 'committed');
  assert.equal(first.committedRevision, created.match.revision);
  assert.equal(second.status, 'committed');
  assert.equal(second.committedRevision, secondCommit.match.revision);
});

test('concurrent commands at one revision allow only one commit', async () => {
  const store = new InMemoryOnlineAuthorityRepository();
  const created = createMatch();
  await store.commit(created);

  const left = joinCommit(created.snapshot.aggregate, 'seeker-left', 2, created.match.revision);
  const right = joinCommit(created.snapshot.aggregate, 'seeker-right', 3, created.match.revision);
  const results = await Promise.all([store.commit(left), store.commit(right)]);

  assert.deepEqual(results.map((result) => result.status).sort(), ['committed', 'revision_conflict']);
  const conflict = results.find((result) => result.status === 'revision_conflict');
  assert.equal(conflict?.currentRevision, left.match.revision);
});

test('retrying the same idempotency key returns the original result without a second commit', async () => {
  const store = new InMemoryOnlineAuthorityRepository();
  const created = createMatch();
  await store.commit(created);
  const join = joinCommit(created.snapshot.aggregate, 'seeker-1', 2, created.match.revision);

  const committed = await store.commit(join);
  const retry = await store.commit(join);

  assert.equal(committed.status, 'committed');
  assert.equal(retry.status, 'duplicate');
  assert.equal(retry.committedRevision, committed.committedRevision);
  assert.equal(retry.result.commandId, committed.result.commandId);
  assert.equal(committed.result.aggregate, undefined);
  assert.deepEqual(committed.result.events, []);
  assert.equal(retry.result.aggregate, undefined);
});

test('one authenticated user cannot bind multiple players in the same match', async () => {
  const store = new InMemoryOnlineAuthorityRepository();
  const membership = {
    matchId: 'atomic-match',
    authUserId: 'auth-player',
    playerId: 'player-one',
    joinedAt: '2026-10-24T12:00:00.000Z',
    status: 'active' as const
  };

  await store.bindMembership(membership);
  await assert.rejects(
    store.bindMembership({ ...membership, playerId: 'player-two' }),
    { code: 'PLAYER_ALREADY_JOINED' }
  );
  assert.deepEqual(await store.findMembership('atomic-match', 'auth-player'), membership);
});

test('Supabase authority repository uses the transactional RPC and server-owned membership table', async () => {
  const created = createMatch();
  const expectedResult: OnlineCommandCommitResult = {
    status: 'committed',
    committedRevision: created.match.revision,
    result: { accepted: true, matchId: created.matchId, commandId: created.commandId, events: [] }
  };
  const calls: Array<{ kind: string; value: unknown }> = [];
  const membership: MatchMembershipRecord = {
    matchId: 'atomic-match',
    authUserId: 'auth-player',
    playerId: 'player-one',
    joinedAt: '2026-10-24T12:00:00.000Z',
    status: 'active'
  };
  const client: SupabaseTableClient = {
    async insert(table, rows) {
      calls.push({ kind: 'insert', value: { table, rows } });
    },
    async upsert() { throw new Error('Membership identities must be immutable inserts.'); },
    async rpc<TResponse>(functionName, args) {
      calls.push({ kind: 'rpc', value: { functionName, args } });
      return expectedResult as TResponse;
    },
    async selectMany() { return []; },
    async selectOne<TRecord>(table, filters) {
      calls.push({ kind: 'selectOne', value: { table, filters } });
      if ('playerId' in filters) return undefined;
      if (calls.filter((call) => call.kind === 'selectOne').length === 1) return undefined;
      return membership as TRecord;
    }
  };
  const repository = new SupabaseOnlineAuthorityRepository(client);

  assert.deepEqual(await repository.commit(created), expectedResult);
  await repository.bindMembership(membership);
  assert.deepEqual(await repository.findMembership('atomic-match', 'auth-player'), membership);

  assert.deepEqual(calls, [
    { kind: 'rpc', value: { functionName: 'commit_match_revision', args: { p_payload: created } } },
    { kind: 'selectOne', value: { table: 'match_memberships', filters: { matchId: 'atomic-match', authUserId: 'auth-player' } } },
    { kind: 'selectOne', value: { table: 'match_memberships', filters: { matchId: 'atomic-match', playerId: 'player-one', status: 'active' } } },
    { kind: 'insert', value: { table: 'match_memberships', rows: [membership] } },
    { kind: 'selectOne', value: { table: 'match_memberships', filters: { matchId: 'atomic-match', authUserId: 'auth-player' } } }
  ]);
});
