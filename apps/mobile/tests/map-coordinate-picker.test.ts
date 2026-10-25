import assert from 'node:assert/strict';
import test from 'node:test';

import { projectMapCoordinate, unprojectMapCoordinate } from '../src/features/map/map-geometry.ts';

test('map destination picker round-trips coordinates through a panned and zoomed web map', () => {
  const bounds = { minLongitude: 13.9, maxLongitude: 14.1, minLatitude: 49.9, maxLatitude: 50.1 };
  const viewport = { width: 390, height: 240, padding: 18 };
  const transform = { scale: 1.7, offsetX: 32, offsetY: -21 };
  const coordinate = { latitude: 50.025, longitude: 14.035 };
  const mapPoint = projectMapCoordinate(coordinate, bounds, viewport);
  const screenPoint = {
    x: transform.offsetX + viewport.width / 2 + transform.scale * (mapPoint.x - viewport.width / 2),
    y: transform.offsetY + viewport.height / 2 + transform.scale * (mapPoint.y - viewport.height / 2)
  };

  assert.deepEqual(unprojectMapCoordinate({ ...screenPoint, bounds, viewport, transform }), coordinate);
});

test('map destination picker rejects invalid transform input', () => {
  assert.equal(unprojectMapCoordinate({
    x: 100,
    y: 100,
    bounds: { minLongitude: 13, maxLongitude: 14, minLatitude: 49, maxLatitude: 50 },
    viewport: { width: 300, height: 200, padding: 18 },
    transform: { scale: 0, offsetX: 0, offsetY: 0 }
  }), undefined);
});
