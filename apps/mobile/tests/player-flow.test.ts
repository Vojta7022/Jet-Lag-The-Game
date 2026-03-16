import assert from 'node:assert/strict';
import test from 'node:test';

import {
  canAccessHostControls,
  isPregameState,
  shouldRedirectSetupScreen
} from '../src/navigation/player-flow.ts';

test('pregame helper distinguishes setup states from live gameplay', () => {
  assert.equal(isPregameState('lobby'), true);
  assert.equal(isPregameState('map_setup'), true);
  assert.equal(isPregameState('seek_phase'), false);
  assert.equal(shouldRedirectSetupScreen('hide_phase'), true);
  assert.equal(shouldRedirectSetupScreen('rules_confirmation'), false);
});

test('host control access stays restricted to host-admin views', () => {
  assert.equal(canAccessHostControls('host', 'host_admin'), true);
  assert.equal(canAccessHostControls('host', 'player_private'), true);
  assert.equal(canAccessHostControls('seeker', 'player_private'), false);
  assert.equal(canAccessHostControls('spectator', 'public_match'), false);
});
