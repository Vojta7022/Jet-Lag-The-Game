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

test('OpenStreetMap provider maps the printed Tentacles place classes and leaves metro lines unsupported', async () => {
  const submittedQueries: string[] = [];
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQueries.push(decodeURIComponent(String(init?.body).replace(/^data=/, '')));
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    }
  });
  const regionGeometry = {
    type: 'Polygon' as const,
    coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]]
  };

  const dataset = await provider.load({ featureClassIds: ['museums', 'libraries'], regionGeometry });
  const unsupported = await provider.load({ featureClassIds: ['metro-lines'], regionGeometry });

  assert.ok(dataset);
  assert.equal(submittedQueries.length, 2);
  assert.match(submittedQueries[0]!, /tourism.*museum/);
  assert.match(submittedQueries[1]!, /amenity.*library/);
  assert.equal(unsupported, undefined);
});

test('OpenStreetMap provider loads only named stations for the station-name-length Matching question', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        { type: 'node', id: 1, lat: 50.1, lon: 14.1, tags: { name: "St. John's Rd", railway: 'station' } },
        { type: 'node', id: 2, lat: 50.2, lon: 14.2, tags: { ref: 'ST-2', railway: 'station' } }
      ] }), { status: 200 });
    }
  });
  const dataset = await provider.load({
    featureClassIds: ['stations-name-length'],
    regionGeometry: { type: 'Polygon', coordinates: [[[14, 50], [14.4, 50], [14.4, 50.4], [14, 50.4], [14, 50]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /railway.*station/);
  assert.deepEqual(dataset.features.map((feature) => feature.label), ["St. John's Rd"]);
});

test('OpenStreetMap provider loads consulate locations for Matching and Measuring', async () => {
  const submittedQueries: string[] = [];
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQueries.push(decodeURIComponent(String(init?.body).replace(/^data=/, '')));
      return new Response(JSON.stringify({ elements: [
        { type: 'node', id: 31, lat: 50.08, lon: 14.43, tags: { name: 'Consulate A', diplomatic: 'consulate' } }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['foreign-consulate'],
    regionGeometry: { type: 'Polygon', coordinates: [[[14.3, 50], [14.6, 50], [14.6, 50.2], [14.3, 50.2], [14.3, 50]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQueries[0]!, /office.*diplomatic.*diplomatic.*consulate/);
  assert.deepEqual(dataset.features.map((feature) => feature.label), ['Consulate A']);
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
