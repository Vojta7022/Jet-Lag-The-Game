import assert from 'node:assert/strict';
import test from 'node:test';

import {
  queryClosestAmongCandidates,
  queryNearestFeature,
  queryWithinRadius,
  type GeoFeatureRecord
} from '../../packages/geo/src/index.ts';

const features: GeoFeatureRecord[] = [
  {
    featureId: 'airport-west',
    featureClassId: 'commercial-airport',
    label: 'Airport West',
    representativePoint: {
      latitude: 50.2,
      longitude: 14.1
    },
    geometrySupport: 'point',
    coverage: 'exact'
  },
  {
    featureId: 'airport-east',
    featureClassId: 'commercial-airport',
    label: 'Airport East',
    representativePoint: {
      latitude: 50.2,
      longitude: 14.3
    },
    geometrySupport: 'point',
    coverage: 'exact'
  },
  {
    featureId: 'museum-north',
    featureClassId: 'museums',
    label: 'Museum North',
    representativePoint: {
      latitude: 50.24,
      longitude: 14.22
    },
    geometrySupport: 'point',
    coverage: 'exact'
  }
];

test('nearest-feature workflow returns the closest feature with exact precision for point data', () => {
  const result = queryNearestFeature({
    features,
    featureClassIds: ['commercial-airport'],
    point: [14.09, 50.2]
  });

  assert.equal(result.feature?.featureId, 'airport-west');
  assert.equal(result.precision, 'exact');
  assert.ok((result.distanceMeters ?? 0) < 2_000);
});

test('within-radius workflow filters candidates by class and distance', () => {
  const result = queryWithinRadius({
    features,
    featureClassIds: ['commercial-airport'],
    center: [14.1, 50.2],
    radiusMeters: 5_000
  });

  assert.equal(result.features.length, 1);
  assert.equal(result.features[0]?.featureId, 'airport-west');
});

test('closest-among-candidates workflow returns a ranked candidate list', () => {
  const result = queryClosestAmongCandidates({
    candidates: features.filter((feature) => feature.featureClassId === 'commercial-airport'),
    point: [14.29, 50.2]
  });

  assert.equal(result.feature?.featureId, 'airport-east');
  assert.equal(result.rankedCandidates[0]?.featureId, 'airport-east');
  assert.equal(result.rankedCandidates[1]?.featureId, 'airport-west');
});
