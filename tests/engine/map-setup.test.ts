import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand, EngineCommandError } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase } from './helpers.ts';

function mapSetupAggregate() {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  aggregate.lifecycleState = 'map_setup';
  delete aggregate.mapRegion;
  delete aggregate.searchArea;
  return { contentPack, aggregate };
}

test('map setup stores custom layers and station sources in the match and shares them in player projections', () => {
  const { contentPack, aggregate } = mapSetupAggregate();
  const settings = {
    customOverlays: [{
      id: 'river-route',
      name: 'River route',
      color: '#2374ab',
      visible: true,
      geometry: { type: 'LineString', coordinates: [[14.1, 50.1], [14.2, 50.2]] }
    }],
    stationSource: 'both' as const,
    customStations: [{ id: 'museum', name: 'Museum', latitude: 50.2, longitude: 14.2 }]
  };
  const result = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'create_map_region',
      payload: {
        regionId: 'shared-region',
        displayName: 'Shared region',
        geometry: {
          type: 'Polygon', coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]]
        },
        ...settings
      }
    },
    70
  ), contentPack);

  assert.deepEqual(result.aggregate.mapRegion?.customOverlays, settings.customOverlays);
  assert.equal(result.aggregate.mapRegion?.stationSource, 'both');
  assert.deepEqual(result.aggregate.mapRegion?.customStations, settings.customStations);

  const publicProjection = buildMatchProjection(result.aggregate, contentPack, { scope: 'public_match' });
  assert.deepEqual(publicProjection.visibleMap?.customOverlays, settings.customOverlays);
  assert.equal(publicProjection.visibleMap?.stationSource, 'both');
  assert.deepEqual(publicProjection.visibleMap?.customStations, settings.customStations);

  for (const viewer of [
    { scope: 'team_private' as const, viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider' as const },
    { scope: 'team_private' as const, viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker' as const }
  ]) {
    const playerProjection = buildMatchProjection(result.aggregate, contentPack, viewer);
    assert.deepEqual(playerProjection.visibleMap?.customOverlays, settings.customOverlays);
    assert.deepEqual(playerProjection.visibleMap?.customStations, settings.customStations);
    assert.equal(playerProjection.visibleMap?.stationSource, 'both');
  }

  const revisedOverlay = { ...settings.customOverlays[0]!, visible: false };
  const updated = executeCommand(result.aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'create_map_region',
      payload: {
        regionId: 'shared-region',
        displayName: 'Shared region',
        geometry: { type: 'Polygon', coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]] },
        customOverlays: [revisedOverlay],
        stationSource: 'custom',
        customStations: settings.customStations
      }
    },
    73
  ), contentPack);
  assert.deepEqual(updated.aggregate.mapRegion?.customOverlays, [revisedOverlay]);
  assert.equal(updated.aggregate.mapRegion?.stationSource, 'custom');
});

test('map setup rejects invalid custom overlay geometry', () => {
  const { contentPack, aggregate } = mapSetupAggregate();
  assert.throws(() => executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'create_map_region',
      payload: {
        regionId: 'invalid-layer-region',
        geometry: { type: 'Polygon', coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]] },
        customOverlays: [{
          id: 'broken', name: 'Broken layer', color: '#2374ab', visible: true,
          geometry: { type: 'Point', coordinates: [250, 50] }
        }]
      }
    },
    72
  ), contentPack), (error: unknown) => error instanceof EngineCommandError &&
    error.issues.some((issue) => issue.code === 'INVALID_MAP_SETUP_DATA'));
});

test('map setup rejects custom station coordinates outside the playable globe', () => {
  const { contentPack, aggregate } = mapSetupAggregate();
  assert.throws(() => executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'create_map_region',
      payload: {
        regionId: 'invalid-region',
        geometry: { type: 'Polygon', coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]] },
        stationSource: 'custom',
        customStations: [{ id: 'outside-globe', name: 'Impossible', latitude: 95, longitude: 14 }]
      }
    },
    71
  ), contentPack), (error: unknown) => error instanceof EngineCommandError &&
    error.issues.some((issue) => issue.code === 'INVALID_MAP_SETUP_DATA'));
});
