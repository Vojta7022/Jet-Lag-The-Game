import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildHidingZoneCircle,
  findTransitStationsInGeometry,
  filterStationsToGeometry,
  getHidingRadiusMeters
} from '../src/features/map/station-layer.ts';

const square = {
  type: 'Polygon',
  coordinates: [[[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]]]
};

test('station candidates are filtered to the playable polygon', () => {
  const stations = [
    { stationId: 'inside', name: 'Inside', latitude: 50.5, longitude: 14.5 },
    { stationId: 'outside', name: 'Outside', latitude: 52, longitude: 14.5 }
  ];
  assert.deepEqual(filterStationsToGeometry(stations, square).map((station) => station.stationId), ['inside']);
});

test('Overpass candidates are normalized, deduplicated, and returned with attribution-ready OSM IDs', async () => {
  let requestBody = '';
  const stations = await findTransitStationsInGeometry(square, {
    fetcher: async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({ elements: [
        { type: 'node', id: 42, lat: 50.5, lon: 14.5, tags: { railway: 'station', name: 'Central' } },
        { type: 'node', id: 43, lat: 50.501, lon: 14.5, tags: { railway: 'station', name: 'Central' } },
        { type: 'node', id: 45, lat: 50.503, lon: 14.5, tags: { railway: 'station', name: 'Central' } },
        { type: 'node', id: 44, lat: 52, lon: 14.5, tags: { railway: 'station', name: 'Outside' } }
      ] }));
    }
  });

  assert.deepEqual(stations.map((station) => station.stationId), ['node/42', 'node/45']);
  assert.equal(stations[0]?.name, 'Central');
  assert.ok(decodeURIComponent(requestBody).includes('railway'));
});

test('hiding-zone circles use 500m small/medium and 1km large radii', () => {
  assert.equal(getHidingRadiusMeters('small'), 500);
  assert.equal(getHidingRadiusMeters('medium'), 500);
  assert.equal(getHidingRadiusMeters('large'), 1000);

  const circle = buildHidingZoneCircle({ latitude: 50, longitude: 14 }, 500);
  assert.equal(circle.type, 'Polygon');
  const ring = circle.coordinates as number[][][];
  assert.equal(ring[0]?.length, 65);
  assert.deepEqual(ring[0]?.[0], ring[0]?.[64]);
});
