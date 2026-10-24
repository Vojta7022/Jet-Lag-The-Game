import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchStandings, hasFinishedHiderRotation } from '../src/features/map/match-standings.ts';

const players = [
  { playerId: 'p1', displayName: 'Alex' },
  { playerId: 'p2', displayName: 'Blair' },
  { playerId: 'p3', displayName: 'Casey' }
];

test('final standings rank hiders by final hiding time and retain tied places', () => {
  const standings = buildMatchStandings(players, [
    { hiderTeamId: 'team-hider', hiderPlayerId: 'p1', foundByPlayerId: 'p2', foundAt: '2026-01-01T00:00:00Z', survivalSeconds: 600, timeBonusSeconds: 60, finalHidingTimeSeconds: 660 },
    { hiderTeamId: 'team-hider', hiderPlayerId: 'p2', foundByPlayerId: 'p1', foundAt: '2026-01-01T00:10:00Z', survivalSeconds: 720, timeBonusSeconds: 0, finalHidingTimeSeconds: 720 },
    { hiderTeamId: 'team-hider', hiderPlayerId: 'p3', foundByPlayerId: 'p1', foundAt: '2026-01-01T00:20:00Z', survivalSeconds: 600, timeBonusSeconds: 120, finalHidingTimeSeconds: 720 }
  ], ['p1', 'p2', 'p3']);

  assert.deepEqual(standings.map(({ playerId, scoreSeconds, place }) => ({ playerId, scoreSeconds, place })), [
    { playerId: 'p2', scoreSeconds: 720, place: 1 },
    { playerId: 'p3', scoreSeconds: 720, place: 1 },
    { playerId: 'p1', scoreSeconds: 660, place: 3 }
  ]);
});

test('a hider rotation is complete only when every scheduled player has a result', () => {
  const order = ['p1', 'p2'];
  const firstResult = { hiderTeamId: 'team-hider', hiderPlayerId: 'p1', foundByPlayerId: 'p2', foundAt: '2026-01-01T00:00:00Z', survivalSeconds: 10 };

  assert.equal(hasFinishedHiderRotation(order, [firstResult]), false);
  assert.equal(hasFinishedHiderRotation(order, [firstResult, { ...firstResult, hiderPlayerId: 'p2' }]), true);
});
