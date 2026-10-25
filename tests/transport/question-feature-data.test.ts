import assert from 'node:assert/strict';
import test from 'node:test';

import { loadQuestionFeatureDataset } from '../../packages/transport/src/question-feature-data.ts';
import { makeEnvelope, loadEngineTestContentPack, setupMatchToHidePhase } from '../engine/helpers.ts';

test('authority loads its own transit station snapshot before accepting a hiding zone', async () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  aggregate.mode = 'online';
  let request: { featureClassIds: string[]; regionGeometry: unknown } | undefined;
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test',
    retrievedAt: '2026-10-25T12:00:00.000Z',
    coverage: 'approximate' as const,
    features: []
  };
  const result = await loadQuestionFeatureDataset({
    aggregate,
    contentPack,
    envelope: makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'set_hiding_zone',
      payload: { stationId: 'node/1', stationName: 'Central', latitude: 0, longitude: 0 }
    } as never, 1),
    provider: {
      async load(value) {
        request = value;
        return dataset;
      }
    }
  });

  assert.equal(result, dataset);
  assert.deepEqual(request?.featureClassIds, ['rail-station']);
  assert.deepEqual(request?.regionGeometry, aggregate.mapRegion?.boundaryGeometry);
});

test('authority uses the saved custom station source without an external map lookup', async () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  aggregate.mode = 'online';
  aggregate.mapRegion = { ...aggregate.mapRegion!, stationSource: 'custom' };
  let calls = 0;
  const result = await loadQuestionFeatureDataset({
    aggregate,
    contentPack,
    envelope: makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'set_hiding_zone',
      payload: { stationId: 'custom:imported:one', stationName: 'Custom Stop', latitude: 0, longitude: 0 }
    } as never, 2),
    provider: {
      async load() {
        calls += 1;
        return undefined;
      }
    }
  });

  assert.equal(result, undefined);
  assert.equal(calls, 0);
});

test('authority loads both trusted cuisine-country boundaries before a seeker reports distances', async () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  aggregate.mode = 'online';
  aggregate.distantCuisineChallenge = {
    sourceCardInstanceId: 'distant-card', requiredSeekerPlayerIds: ['seeker-1'], startedAt: '2026-10-25T12:00:00.000Z',
    origin: { restaurantName: 'Origin', restaurantLatitude: 50, restaurantLongitude: 14, cuisineCountryName: 'Source', cuisineCountryRegionId: 'osm:relation:1', submittedByPlayerId: 'hider-1', submittedAt: '2026-10-25T12:00:00.000Z' },
    target: { restaurantName: 'Target', restaurantLatitude: 50, restaurantLongitude: 14, cuisineCountryName: 'Target', cuisineCountryRegionId: 'osm:relation:2', submittedByPlayerId: 'seeker-1', submittedAt: '2026-10-25T12:00:00.000Z', rejectedAttemptCount: 0 },
    distanceByPlayerId: {}, completedAtByPlayerId: {}
  };
  const dataset = { source: 'OpenStreetMap' as const, sourceUrl: 'https://www.openstreetmap.org/copyright', sourceVersion: 'test', retrievedAt: '2026-10-25T12:00:00.000Z', coverage: 'exact' as const, features: [] };
  let requestedIds: string[] | undefined;

  const result = await loadQuestionFeatureDataset({
    aggregate,
    contentPack,
    envelope: makeEnvelope(aggregate.matchId, { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'report_distant_cuisine_distance', payload: { sourceCardInstanceId: 'distant-card' }
    }, 1),
    countryBoundaryDataProvider: {
      async loadCountryBoundaries(ids: string[]) { requestedIds = ids; return dataset; }
    }
  });

  assert.equal(result, dataset);
  assert.deepEqual(requestedIds, ['osm:relation:1', 'osm:relation:2']);
});
