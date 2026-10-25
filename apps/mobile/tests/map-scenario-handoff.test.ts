import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildCreateMatchRouteFromScenario,
  buildLobbyRouteForMatch,
  buildMapRouteFromLobby
} from '../src/navigation/map-scenario-handoff.ts';

test('a saved standalone map scenario survives match creation and reaches map setup', () => {
  const scenario = 'compressed-map-scenario';
  assert.deepEqual(buildCreateMatchRouteFromScenario(scenario), {
    pathname: '/create-match',
    params: { scenario }
  });
  const lobbyRoute = buildLobbyRouteForMatch(scenario);
  assert.deepEqual(lobbyRoute, { pathname: '/lobby', params: { scenario } });
  assert.deepEqual(buildMapRouteFromLobby('/map', scenario), { pathname: '/map', params: { scenario } });
});

test('scenario route parameters discard empty and duplicate route values', () => {
  assert.deepEqual(buildLobbyRouteForMatch([' prepared-map ', 'ignored']), {
    pathname: '/lobby',
    params: { scenario: 'prepared-map' }
  });
  assert.equal(buildLobbyRouteForMatch(['', 'prepared-map']), '/lobby');
});

test('map scenario handoff keeps the normal route when no scenario was prepared', () => {
  assert.equal(buildLobbyRouteForMatch(undefined), '/lobby');
  assert.equal(buildMapRouteFromLobby('/map', undefined), '/map');
  assert.equal(buildMapRouteFromLobby('/dashboard', 'prepared-map'), '/dashboard');
});
