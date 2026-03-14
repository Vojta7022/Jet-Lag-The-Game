import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clipGeometryToConvexPolygon,
  filterGeometryByGrid,
  geometryBoundingBox,
  relationHalfPlane
} from '../../packages/geo/src/index.ts';
import { makeSquarePolygon } from '../engine/helpers.ts';

test('convex polygon clipping keeps geometry inside the clip polygon', () => {
  const subject = makeSquarePolygon();
  const clip = makeSquarePolygon(0.1);
  const clipped = clipGeometryToConvexPolygon({
    subject,
    clip
  });

  const bounds = geometryBoundingBox(clipped);
  assert.ok(bounds);
  assert.ok(Math.abs((bounds?.minLon ?? 0) - 14.1) < 0.001);
  assert.ok(Math.abs((bounds?.maxLon ?? 0) - 14.4) < 0.001);
  assert.ok(Math.abs((bounds?.minLat ?? 0) - 50.1) < 0.001);
  assert.ok(Math.abs((bounds?.maxLat ?? 0) - 50.4) < 0.001);
});

test('half-plane clipping can keep the side closer to the newer seeker sample', () => {
  const subject = makeSquarePolygon();
  const clipped = relationHalfPlane({
    from: [14.05, 50.2],
    to: [14.35, 50.2],
    relation: 'closer_to_to',
    subject
  });

  const bounds = geometryBoundingBox(clipped);
  assert.ok(bounds);
  assert.ok((bounds?.minLon ?? 0) >= 14.2 - 0.02);
  assert.ok((bounds?.maxLon ?? 0) <= 14.4);
});

test('grid filtering produces bounded approximate geometry for predicate-based constraints', () => {
  const subject = makeSquarePolygon();
  const filtered = filterGeometryByGrid({
    baseGeometry: subject,
    stepMeters: 2_000,
    predicate: (point) => point[0] >= 14.2
  });

  const keptBounds = geometryBoundingBox(filtered.keptGeometry);
  const removedBounds = geometryBoundingBox(filtered.removedGeometry);

  assert.ok(filtered.keptCount > 0);
  assert.ok(filtered.removedCount > 0);
  assert.ok(keptBounds);
  assert.ok(removedBounds);
  assert.ok((keptBounds?.minLon ?? 0) >= 14.18);
  assert.ok((removedBounds?.maxLon ?? 0) <= 14.22);
});
