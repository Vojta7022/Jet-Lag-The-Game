import assert from 'node:assert/strict';
import test from 'node:test';

import { panMapViewport, zoomMapViewport, type MapViewportTransform } from '../src/features/map/map-canvas-gesture.ts';

test('map viewport pans by the pointer movement', () => {
  const start: MapViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  assert.deepEqual(panMapViewport(start, 28, -12), { scale: 1, offsetX: 28, offsetY: -12 });
});

test('map viewport zoom preserves the focal point and clamps its scale', () => {
  const start: MapViewportTransform = { scale: 1, offsetX: 0, offsetY: 0 };
  assert.deepEqual(zoomMapViewport(start, 2, 80, 120, 200, 240), {
    scale: 2,
    offsetX: 20,
    offsetY: 0
  });
  assert.equal(zoomMapViewport(start, 100, 80, 120, 200, 240).scale, 4);
  assert.equal(zoomMapViewport(start, 0.01, 80, 120, 200, 240).scale, 1);
});
