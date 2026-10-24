import assert from 'node:assert/strict';
import test from 'node:test';

import { canLeaveLobby, canManageLobbyMembers, canRemoveLobbyPlayer } from '../src/features/lobby/lobby-membership-model.ts';

test('only the host can manage members before gameplay starts', () => {
  assert.equal(canManageLobbyMembers('host', 'lobby'), true);
  assert.equal(canManageLobbyMembers('seeker', 'lobby'), false);
  assert.equal(canManageLobbyMembers('host', 'hide_phase'), false);
});

test('participants can leave only their own pregame match and the host cannot be removed', () => {
  assert.equal(canLeaveLobby('seeker', 'seeker-1', 'role_assignment'), true);
  assert.equal(canLeaveLobby('host', 'host-1', 'role_assignment'), false);
  assert.equal(canLeaveLobby('hider', 'hider-1', 'seek_phase'), false);
  assert.equal(canRemoveLobbyPlayer(true, 'seeker-1', 'host-1'), true);
  assert.equal(canRemoveLobbyPlayer(true, 'host-1', 'host-1'), false);
});
