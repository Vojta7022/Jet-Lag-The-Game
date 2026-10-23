import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection } from '../../packages/engine/src/index.ts';
import { representativePointFromGeometry } from '../../packages/geo/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase } from './helpers.ts';

test('hider can set a hidden station-centered zone using the selected scale radius', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'medium');
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);

  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: {
      stationId: 'node/123',
      stationName: 'Central Station',
      latitude: point![1],
      longitude: point![0]
    }
  } as never, 30), contentPack);

  assert.equal(result.aggregate.hiddenState.hidingZone?.stationId, 'node/123');
  assert.equal(result.aggregate.hiddenState.hidingZone?.radiusMeters, 500);
  assert.ok(result.aggregate.hiddenState.hidingZone?.selectedAt);
});

test('station-centered zone is private from seekers and visible to hider and referee', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'large');
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const updated = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  } as never, 31), contentPack).aggregate;

  const seeker = buildMatchProjection(updated, contentPack, { scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker' });
  const hider = buildMatchProjection(updated, contentPack, { scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider' });
  const referee = buildMatchProjection(updated, contentPack, { scope: 'host_admin', viewerPlayerId: 'host-1', viewerRole: 'host' });
  const publicHiderRequest = buildMatchProjection(updated, contentPack, { scope: 'public_match', viewerPlayerId: 'hider-1', viewerRole: 'hider' });
  assert.equal(seeker.hiddenState, undefined);
  assert.equal(hider.hiddenState?.hidingZone?.radiusMeters, 1000);
  assert.equal(hider.hiddenState?.hiderLocation, undefined);
  assert.equal(referee.hiddenState?.hidingZone?.stationId, 'node/123');
  assert.equal(publicHiderRequest.hiddenState, undefined);
});

test('hiding-zone command rejects stations outside the map and rejects seeker access', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  const command = {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/outside', stationName: 'Outside', latitude: 0, longitude: 0 }
  } as never;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, command, 40), contentPack), /full hiding zone must fit inside/);

  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central', latitude: point![1], longitude: point![0] }
  } as never, 41), contentPack), /does not have permission/);
});
