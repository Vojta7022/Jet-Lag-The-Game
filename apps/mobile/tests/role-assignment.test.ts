import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchProjection } from '../../../packages/shared-types/src/index.ts';

import {
  buildRoleAssignmentCommands,
  getAssignablePlayers,
  hasRequiredRoleAssignments,
  isRoleAssignmentStage
} from '../src/features/roles/role-assignment.ts';

function makeProjection(players: MatchProjection['players'], lifecycleState: MatchProjection['lifecycleState'] = 'lobby'): MatchProjection {
  return {
    matchId: 'match-role-test',
    contentPackId: 'pack-1',
    lifecycleState,
    players,
    teams: [],
    visibleMovementTracks: [],
    visibleChatChannels: [],
    visibleChatMessages: [],
    visibleAttachments: [],
    visibleCards: [],
    visibleQuestions: [],
    visibleConstraints: [],
    visibleTimers: []
  };
}

test('role assignment helpers keep one selected hider and move other joined players onto seekers', () => {
  const projection = makeProjection([
    { playerId: 'host-1', displayName: 'Host', connectionState: 'connected', role: 'host' },
    { playerId: 'player-a', displayName: 'Alpha', connectionState: 'connected' },
    { playerId: 'player-b', displayName: 'Bravo', connectionState: 'connected', role: 'seeker', teamId: 'team-seeker' }
  ]);

  const assignablePlayers = getAssignablePlayers(projection);
  const commands = buildRoleAssignmentCommands(projection, 'player-a', 'hider');

  assert.deepEqual(assignablePlayers.map((player) => player.playerId), ['host-1', 'player-a', 'player-b']);
  assert.deepEqual(commands, [
    {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'host-1',
        role: 'seeker',
        teamId: 'team-seeker'
      }
    },
    {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'player-a',
        role: 'hider',
        teamId: 'team-hider'
      }
    },
    {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'player-b',
        role: 'seeker',
        teamId: 'team-seeker'
      }
    }
  ]);
});

test('role assignment helpers let the host join the hider side while keeping the rest on seekers', () => {
  const projection = makeProjection([
    { playerId: 'host-1', displayName: 'Host', connectionState: 'connected', role: 'host' },
    { playerId: 'player-a', displayName: 'Alpha', connectionState: 'connected' }
  ]);

  const commands = buildRoleAssignmentCommands(projection, 'host-1', 'hider');

  assert.deepEqual(commands, [
    {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'host-1',
        role: 'hider',
        teamId: 'team-hider'
      }
    },
    {
      type: 'assign_role',
      payload: {
        targetPlayerId: 'player-a',
        role: 'seeker',
        teamId: 'team-seeker'
      }
    }
  ]);
});

test('role assignment helpers require both sides before setup can continue', () => {
  const incompleteProjection = makeProjection([
    { playerId: 'host-1', displayName: 'Host', connectionState: 'connected', role: 'host' },
    { playerId: 'player-a', displayName: 'Alpha', connectionState: 'connected', role: 'hider', teamId: 'team-hider' }
  ]);
  const completeProjection = makeProjection([
    { playerId: 'host-1', displayName: 'Host', connectionState: 'connected', role: 'host' },
    { playerId: 'player-a', displayName: 'Alpha', connectionState: 'connected', role: 'hider', teamId: 'team-hider' },
    { playerId: 'player-b', displayName: 'Bravo', connectionState: 'connected', role: 'seeker', teamId: 'team-seeker' }
  ]);

  assert.equal(isRoleAssignmentStage('lobby'), true);
  assert.equal(isRoleAssignmentStage('seek_phase'), false);
  assert.equal(hasRequiredRoleAssignments(incompleteProjection), false);
  assert.equal(hasRequiredRoleAssignments(completeProjection), true);
});
