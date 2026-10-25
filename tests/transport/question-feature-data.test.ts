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
