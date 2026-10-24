import assert from 'node:assert/strict';
import test from 'node:test';

import { OpenStreetMapQuestionFeatureProvider } from '../../packages/geo/src/index.ts';

test('OpenStreetMap question feature provider bounds its query and drops features outside the playable polygon', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    endpoint: 'https://overpass.example/api/interpreter',
    now: () => '2026-10-24T12:00:00.000Z',
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({
        elements: [
          { type: 'node', id: 101, lat: 0.5, lon: 0.5, tags: { name: 'Inside Hospital', amenity: 'hospital' } },
          { type: 'way', id: 202, center: { lat: 1.5, lon: 1.5 }, tags: { name: 'Outside Hospital', amenity: 'hospital' } }
        ]
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['hospital'],
    regionGeometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
    }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /amenity.*hospital/);
  assert.match(submittedQuery, /\(0,0,1,1\)/);
  assert.deepEqual(dataset.features.map((feature) => feature.featureId), ['osm:node/101']);
  assert.equal(dataset.source, 'OpenStreetMap');
  assert.equal(dataset.coverage, 'approximate');
  assert.equal(dataset.retrievedAt, '2026-10-24T12:00:00.000Z');
});

test('OpenStreetMap question feature provider returns undefined for feature types without an agreed mapping', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({ fetch: async () => { throw new Error('must not query'); } });
  const result = await provider.load({
    featureClassIds: ['1st-admin-state'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });
  assert.equal(result, undefined);
});

test('OpenStreetMap feature lookups reuse a short-lived region and class cache', async () => {
  let requestCount = 0;
  const provider = new OpenStreetMapQuestionFeatureProvider({
    now: () => '2026-10-24T12:00:00.000Z',
    fetch: async () => {
      requestCount += 1;
      return new Response(JSON.stringify({ elements: [
        { type: 'node', id: 101, lat: 0.5, lon: 0.5, tags: { name: 'Inside Hospital', amenity: 'hospital' } }
      ] }), { status: 200 });
    }
  });
  const request = {
    featureClassIds: ['hospital'],
    regionGeometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
    }
  };

  const first = await provider.load(request);
  const second = await provider.load(request);
  assert.equal(requestCount, 1);
  assert.deepEqual(second, first);
});
