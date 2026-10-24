import assert from 'node:assert/strict';
import test from 'node:test';

import { EngineCommandError, executeCommand } from '../../packages/engine/src/index.ts';
import type { MatchAggregate } from '../../packages/shared-types/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase } from './helpers.ts';

function lobbyMatch(): MatchAggregate {
  const contentPack = loadEngineTestContentPack();
  let aggregate: MatchAggregate | undefined;
  const commands = [
    { actor: { actorId: 'auth-host', playerId: 'host-1', role: 'host' as const }, command: {
      type: 'create_match' as const,
      payload: { mode: 'online' as const, contentPackId: contentPack.packId, hostPlayerId: 'host-1', hostDisplayName: 'Host' }
    } },
    ...[
      { playerId: 'hider-1', displayName: 'Hider' },
      { playerId: 'seeker-1', displayName: 'Seeker' }
    ].map((player, index) => ({
      actor: { actorId: `auth-${player.playerId}`, playerId: player.playerId, role: 'spectator' as const },
      command: { type: 'join_match' as const, payload: player },
      step: index + 2
    }))
  ];
  for (const [index, item] of commands.entries()) {
    aggregate = executeCommand(aggregate, makeEnvelope('lobby-membership-match', item.actor, item.command, item.step ?? index + 1), contentPack).aggregate;
  }
  aggregate = executeCommand(aggregate, makeEnvelope('lobby-membership-match', {
    actorId: 'auth-host', playerId: 'host-1', role: 'host'
  }, { type: 'assign_role', payload: { targetPlayerId: 'hider-1', role: 'hider', teamId: 'team-hider' } }, 4), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope('lobby-membership-match', {
    actorId: 'auth-host', playerId: 'host-1', role: 'host'
  }, { type: 'assign_role', payload: { targetPlayerId: 'seeker-1', role: 'seeker', teamId: 'team-seeker' } }, 5), contentPack).aggregate;
  return aggregate!;
}

test('host can remove a player before gameplay and engine state clears their team and role', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = lobbyMatch();
  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'auth-host', playerId: 'host-1', role: 'host'
  }, { type: 'remove_match_player', payload: { playerId: 'hider-1' } }, 6), contentPack);

  assert.equal(result.aggregate.players['hider-1'], undefined);
  assert.equal(result.aggregate.roleAssignments['hider-1'], undefined);
  assert.deepEqual(result.aggregate.teams['team-hider']?.memberPlayerIds, []);
  assert.equal(result.events[0]?.event.type, 'player_removed');
});

test('non-host player cannot remove another lobby member', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = lobbyMatch();

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'auth-hider', playerId: 'hider-1', role: 'hider'
  }, { type: 'remove_match_player', payload: { playerId: 'seeker-1' } }, 6), contentPack), (error: unknown) => {
    assert.ok(error instanceof EngineCommandError);
    assert.equal(error.issues[0]?.code, 'FORBIDDEN');
    return true;
  });
});

test('members cannot be removed after gameplay starts', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'remove_match_player', payload: { playerId: 'seeker-1' } }, 50), contentPack), (error: unknown) => {
    assert.ok(error instanceof EngineCommandError);
    assert.equal(error.issues[0]?.code, 'INVALID_STATE');
    return true;
  });
});

test('a participant can leave their own pregame match', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = lobbyMatch();
  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'auth-seeker', playerId: 'seeker-1', role: 'seeker'
  }, { type: 'leave_match', payload: {} }, 6), contentPack);

  assert.equal(result.aggregate.players['seeker-1'], undefined);
  assert.equal(result.aggregate.roleAssignments['seeker-1'], undefined);
  assert.deepEqual(result.aggregate.teams['team-seeker']?.memberPlayerIds, []);
  assert.equal(result.events[0]?.event.type, 'player_removed');
});
