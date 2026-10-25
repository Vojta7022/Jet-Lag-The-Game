import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenStreetMapCountryBoundaryProvider } from '../../packages/geo/src/index.ts';

test('Nominatim country boundary provider looks up the requested OSM object and keeps its full polygon', async () => {
  let requestedUrl = '';
  const provider = new OpenStreetMapCountryBoundaryProvider({
    fetch: async (input) => {
      requestedUrl = String(input);
      return new Response(JSON.stringify([{
        osm_type: 'relation', osm_id: 51684, addresstype: 'country', name: 'Czechia',
        geojson: { type: 'Polygon', coordinates: [[[12, 48], [19, 48], [19, 51], [12, 51], [12, 48]]] }
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const dataset = await provider.loadCountryBoundaries(['osm:relation:51684']);

  assert.ok(dataset);
  const url = new URL(requestedUrl);
  assert.equal(url.pathname, '/lookup');
  assert.equal(url.searchParams.get('osm_ids'), 'R51684');
  assert.equal(url.searchParams.get('polygon_geojson'), '1');
  assert.equal(dataset.features[0]?.featureId, 'osm:relation:51684');
  assert.equal(dataset.features[0]?.featureClassId, 'country-boundary');
  assert.deepEqual(dataset.features[0]?.geometry, {
    type: 'Polygon', coordinates: [[[12, 48], [19, 48], [19, 51], [12, 51], [12, 48]]]
  });
});

test('Nominatim country boundary provider rejects an administrative subregion returned for the requested ID', async () => {
  const provider = new OpenStreetMapCountryBoundaryProvider({
    fetch: async () => new Response(JSON.stringify([{
      osm_type: 'relation', osm_id: 51684, addresstype: 'state', name: 'Bohemia',
      geojson: { type: 'Polygon', coordinates: [[[12, 48], [19, 48], [19, 51], [12, 51], [12, 48]]] }
    }]), { status: 200, headers: { 'content-type': 'application/json' } })
  });

  assert.equal(await provider.loadCountryBoundaries(['osm:relation:51684']), undefined);
});

test('Nominatim country boundary provider serializes separate lookups to respect its request interval', async () => {
  const requestStarts: number[] = [];
  const provider = new OpenStreetMapCountryBoundaryProvider({
    minimumRequestIntervalMs: 100,
    fetch: async (input) => {
      requestStarts.push(Date.now());
      const requestedId = new URL(String(input)).searchParams.get('osm_ids') ?? 'R0';
      const osmId = Number(requestedId.slice(1));
      return new Response(JSON.stringify([{
        osm_type: 'relation', osm_id: osmId, addresstype: 'country', name: `Country ${osmId}`,
        geojson: { type: 'Polygon', coordinates: [[[12, 48], [19, 48], [19, 51], [12, 51], [12, 48]]] }
      }]), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  await Promise.all([
    provider.loadCountryBoundaries(['osm:relation:1']),
    provider.loadCountryBoundaries(['osm:relation:2'])
  ]);

  assert.equal(requestStarts.length, 2);
  assert.ok(requestStarts[1]! - requestStarts[0]! >= 90);
});

test('Nominatim country boundary provider accepts full country outlines with hundreds of thousands of vertices', async () => {
  const ring: number[][] = [];
  const segmentsPerEdge = 40_000;
  for (const [start, end] of [
    [[12, 48], [19, 48]], [[19, 48], [19, 51]], [[19, 51], [12, 51]], [[12, 51], [12, 48]]
  ]) {
    for (let index = 0; index < segmentsPerEdge; index += 1) {
      const progress = index / segmentsPerEdge;
      ring.push([start![0]! + (end![0]! - start![0]!) * progress, start![1]! + (end![1]! - start![1]!) * progress]);
    }
  }
  ring.push(ring[0]!);
  const provider = new OpenStreetMapCountryBoundaryProvider({
    minimumRequestIntervalMs: 0,
    fetch: async () => new Response(JSON.stringify([{
      osm_type: 'relation', osm_id: 51684, addresstype: 'country', name: 'Czechia',
      geojson: { type: 'Polygon', coordinates: [ring] }
    }]), { status: 200, headers: { 'content-type': 'application/json' } })
  });

  const result = await provider.loadCountryBoundaries(['osm:relation:51684']);

  assert.equal(result?.features[0]?.geometry?.type, 'Polygon');
  assert.equal(result?.features[0]?.geometry?.type === 'Polygon' ? result.features[0].geometry.coordinates[0]?.length : 0, 160_001);
});
