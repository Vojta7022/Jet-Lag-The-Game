import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenMeteoElevationFeatureProvider, pointInGeometry } from '../../packages/geo/src/index.ts';

test('elevation provider batches a region-only Copernicus grid and keeps samples inside the boundary', async () => {
  const requestedCoordinates: [number, number][][] = [];
  const provider = new OpenMeteoElevationFeatureProvider({
    maxSamples: 180,
    fetch: async (input) => {
      const url = new URL(String(input));
      const latitudes = url.searchParams.get('latitude')!.split(',').map(Number);
      const longitudes = url.searchParams.get('longitude')!.split(',').map(Number);
      assert.equal(latitudes.length, longitudes.length);
      assert.ok(latitudes.length <= 100);
      requestedCoordinates.push(latitudes.map((latitude, index) => [longitudes[index]!, latitude]));
      return new Response(JSON.stringify({ elevation: latitudes.map(() => 42) }), { status: 200 });
    }
  });
  const region = {
    type: 'Polygon',
    coordinates: [[[-0.1, 51.45], [0.1, 51.45], [0.1, 51.55], [-0.1, 51.55], [-0.1, 51.45]]]
  };

  const dataset = await provider.load({ featureClassIds: ['sea-level'], regionGeometry: region });

  assert.ok(dataset);
  assert.equal(dataset.source, 'Open-Meteo / Copernicus DEM GLO-90');
  assert.equal(dataset.coverage, 'approximate');
  assert.ok(requestedCoordinates.length > 1);
  assert.ok(dataset.features.length <= 180);
  assert.ok(dataset.features.length > 0);
  assert.ok(dataset.features.every((feature) => feature.properties?.verticalDatum === 'EGM2008'));
  assert.ok(dataset.features.every((feature) => pointInGeometry([feature.longitude, feature.latitude], region)));
  assert.ok(dataset.features.every((feature) => feature.geometry?.type === 'Point'));
});

test('elevation provider ignores unrelated feature requests without making a network call', async () => {
  const provider = new OpenMeteoElevationFeatureProvider({
    fetch: async () => { throw new Error('must not query elevation for OSM features'); }
  });

  assert.equal(await provider.load({
    featureClassIds: ['rail-station'],
    regionGeometry: { type: 'Polygon', coordinates: [] }
  }), undefined);
});

test('elevation provider leaves Sea Level available for manual answering when the service fails', async () => {
  const provider = new OpenMeteoElevationFeatureProvider({
    fetch: async () => { throw new Error('offline'); }
  });
  const dataset = await provider.load({
    featureClassIds: ['sea-level'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [0.01, 0], [0.01, 0.01], [0, 0.01], [0, 0]]] }
  });

  assert.equal(dataset, undefined);
});

