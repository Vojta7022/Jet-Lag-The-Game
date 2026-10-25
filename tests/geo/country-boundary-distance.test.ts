import assert from 'node:assert/strict';
import test from 'node:test';

import { distanceToGeometryMeters, type GeoJsonGeometryModel } from '../../packages/geo/src/index.ts';

test('distance to a country geometry is zero for a point within the country', () => {
  const country: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]]]
  };

  assert.equal(distanceToGeometryMeters([0, 0], country), 0);
});

test('distance to a country geometry uses its nearest boundary instead of its center', () => {
  const country: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[-1, 10], [1, 10], [1, 11], [-1, 11], [-1, 10]]]
  };

  const distance = distanceToGeometryMeters([0, 0], country);
  assert.ok(distance !== undefined);
  assert.ok(distance > 1_100_000 && distance < 1_120_000, `expected about 1,112 km to the southern border, got ${distance}`);
});

test('distance to a multi-country geometry considers every island polygon', () => {
  const country: GeoJsonGeometryModel = {
    type: 'MultiPolygon',
    coordinates: [
      [[[-20, 10], [-19, 10], [-19, 11], [-20, 11], [-20, 10]]],
      [[[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]]
    ]
  };

  const distance = distanceToGeometryMeters([0, 1.5], country);
  assert.ok(distance !== undefined);
  assert.ok(distance > 110_000 && distance < 113_000, `expected about 111 km to the nearer island, got ${distance}`);
});

test('distance from a point inside a polygon hole is measured to the hole boundary', () => {
  const country: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [
      [[-2, -2], [2, -2], [2, 2], [-2, 2], [-2, -2]],
      [[-1, -1], [-1, 1], [1, 1], [1, -1], [-1, -1]]
    ]
  };

  const distance = distanceToGeometryMeters([0, 0], country);
  assert.ok(distance !== undefined);
  assert.ok(distance > 110_000 && distance < 112_000, `expected about 111 km to the hole boundary, got ${distance}`);
});

test('distance to country boundaries works across the antimeridian', () => {
  const country: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[179, 10], [-179, 10], [-179, 11], [179, 11], [179, 10]]]
  };

  const distance = distanceToGeometryMeters([180, 0], country);
  assert.ok(distance !== undefined);
  assert.ok(distance > 1_100_000 && distance < 1_120_000, `expected about 1,112 km across the antimeridian, got ${distance}`);
});

test('distance to geometry rejects missing and non-polygon country data', () => {
  assert.equal(distanceToGeometryMeters([0, 0], undefined), undefined);
  assert.equal(distanceToGeometryMeters([0, 0], { type: 'Point', coordinates: [0, 0] }), undefined);
  assert.equal(distanceToGeometryMeters([181, 0], { type: 'Polygon', coordinates: [[[-1, -1], [1, -1], [1, 1], [-1, -1]]] }), undefined);
});
