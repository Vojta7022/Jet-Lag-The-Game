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

test('OpenStreetMap question feature provider returns undefined for feature types without a mapping', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({ fetch: async () => { throw new Error('must not query'); } });
  const result = await provider.load({
    featureClassIds: ['metro-lines'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });
  assert.equal(result, undefined);
});

test('OpenStreetMap provider groups connected named streets and splits unnamed paths at intersections', async () => {
  let submittedQuery = '';
  let submittedUserAgent = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      submittedUserAgent = new Headers(init?.headers).get('user-agent') ?? '';
      return new Response(JSON.stringify({ elements: [
        {
          type: 'way', id: 101, nodes: [1, 2],
          geometry: [{ lon: 0.1, lat: 0.2 }, { lon: 0.2, lat: 0.2 }],
          tags: { highway: 'residential', name: 'Elm Street' }
        },
        {
          type: 'way', id: 102, nodes: [2, 3],
          geometry: [{ lon: 0.2, lat: 0.2 }, { lon: 0.3, lat: 0.2 }],
          tags: { highway: 'residential', name: 'Elm Street' }
        },
        {
          type: 'way', id: 201, nodes: [10, 11, 12],
          geometry: [{ lon: 0.1, lat: 0.5 }, { lon: 0.2, lat: 0.5 }, { lon: 0.3, lat: 0.5 }],
          tags: { highway: 'path' }
        },
        {
          type: 'way', id: 202, nodes: [20, 11, 21],
          geometry: [{ lon: 0.2, lat: 0.4 }, { lon: 0.2, lat: 0.5 }, { lon: 0.2, lat: 0.6 }],
          tags: { highway: 'footway' }
        }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['street-or-path'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /way\["highway"\]/);
  assert.match(submittedQuery, /out body geom/);
  assert.match(submittedUserAgent, /JetLagTheGame/);
  const named = dataset.features.filter((feature) => feature.label === 'Elm Street');
  const unnamed = dataset.features.filter((feature) => feature.label === 'Unnamed street or path');
  assert.equal(named.length, 1);
  assert.equal(named[0]?.geometry?.type, 'MultiLineString');
  assert.equal(named[0]?.geometrySupport, 'line');
  assert.equal(unnamed.length, 4);
  assert.ok(unnamed.every((feature) => feature.geometrySupport === 'line'));
});

test('OpenStreetMap provider loads polygon geometry for administrative-division Matching', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [{
        type: 'relation',
        id: 9201,
        tags: { boundary: 'administrative', admin_level: '4', name: 'Example State' },
        members: [{
          type: 'way',
          role: 'outer',
          geometry: [
            { lon: 14, lat: 50 }, { lon: 15, lat: 50 }, { lon: 15, lat: 51 },
            { lon: 14, lat: 51 }, { lon: 14, lat: 50 }
          ]
        }]
      }] }), { status: 200 });
    }
  });
  const dataset = await provider.load({
    featureClassIds: ['1st-admin-state'],
    regionGeometry: { type: 'Polygon', coordinates: [[[14.2, 50.2], [14.8, 50.2], [14.8, 50.8], [14.2, 50.8], [14.2, 50.2]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /boundary.*administrative/);
  assert.match(submittedQuery, /out geom tags/);
  assert.equal(dataset.features[0]?.featureId, 'osm:relation/9201');
  assert.equal(dataset.features[0]?.geometry?.type, 'MultiPolygon');
});

test('OpenStreetMap provider emits only shared same-level admin ways inside the playable map for Measuring', async () => {
  const relation = (id: number, name: string, members: Array<{ ref: number; role: string; geometry: Array<{ lon: number; lat: number }> }>) => ({
    type: 'relation', id, tags: { boundary: 'administrative', admin_level: '4', name },
    members: members.map((member) => ({ type: 'way', ...member }))
  });
  const vertical = (ref: number, role: string, reverse = false) => ({
    ref, role, geometry: reverse
      ? [{ lon: 14.2, lat: 50.4 }, { lon: 14.2, lat: 50 }]
      : [{ lon: 14.2, lat: 50 }, { lon: 14.2, lat: 50.4 }]
  });
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async () => new Response(JSON.stringify({ elements: [
      relation(1, 'West State', [
        vertical(10, 'outer', true),
        { ref: 11, role: 'outer', geometry: [{ lon: 14, lat: 50 }, { lon: 14.2, lat: 50 }] },
        { ref: 12, role: 'outer', geometry: [{ lon: 14.2, lat: 50.4 }, { lon: 14, lat: 50.4 }] },
        { ref: 13, role: 'outer', geometry: [{ lon: 14, lat: 50.4 }, { lon: 14, lat: 50 }] }
      ]),
      relation(2, 'East State', [
        vertical(10, 'outer'),
        { ref: 21, role: 'outer', geometry: [{ lon: 14.2, lat: 50 }, { lon: 14.4, lat: 50 }] },
        { ref: 22, role: 'outer', geometry: [{ lon: 14.4, lat: 50 }, { lon: 14.4, lat: 50.4 }] },
        { ref: 23, role: 'outer', geometry: [{ lon: 14.4, lat: 50.4 }, { lon: 14.2, lat: 50.4 }] }
      ])
    ] }), { status: 200 })
  });
  const dataset = await provider.load({
    featureClassIds: ['a-1st-admin-border-state'],
    regionGeometry: { type: 'Polygon', coordinates: [[[14.1, 50.1], [14.3, 50.1], [14.3, 50.3], [14.1, 50.3], [14.1, 50.1]]] }
  });

  assert.ok(dataset);
  const borderFeatures = dataset.features.filter((feature) => feature.featureClassId === 'a-1st-admin-border-state');
  assert.deepEqual(borderFeatures.map((feature) => feature.featureId), ['osm:admin-border/4/10']);
  assert.equal(borderFeatures[0]?.geometrySupport, 'line');
});

test('OpenStreetMap provider includes shared country borders and enclave edges as Measuring targets', async () => {
  let submittedQuery = '';
  const way = (ref: number, role: 'outer' | 'inner', coordinates: Array<{ lon: number; lat: number }>) => ({
    type: 'way', ref, role, geometry: coordinates
  });
  const country = (id: number, name: string, members: unknown[]) => ({
    type: 'relation', id, tags: { boundary: 'administrative', admin_level: '2', name }, members
  });
  const sharedBorder = [{ lon: 0.4, lat: 0 }, { lon: 0.4, lat: 1 }];
  const enclaveRing = [
    { lon: 0.37, lat: 0.37 }, { lon: 0.38, lat: 0.37 }, { lon: 0.38, lat: 0.38 },
    { lon: 0.37, lat: 0.38 }, { lon: 0.37, lat: 0.37 }
  ];
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        country(1, 'Country A', [
          way(100, 'outer', sharedBorder),
          way(101, 'outer', [{ lon: 0.4, lat: 0 }, { lon: 0, lat: 0 }, { lon: 0, lat: 1 }, { lon: 0.4, lat: 1 }]),
          way(200, 'inner', enclaveRing)
        ]),
        country(2, 'Country B', [
          way(100, 'outer', sharedBorder),
          way(102, 'outer', [{ lon: 0.4, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0.4, lat: 1 }])
        ]),
        country(3, 'Enclave C', [way(200, 'outer', enclaveRing)])
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['an-international-border'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0.35, 0.35], [0.45, 0.35], [0.45, 0.45], [0.35, 0.45], [0.35, 0.35]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /admin_level.*2/);
  assert.deepEqual(
    dataset.features.filter((feature) => feature.featureClassId === 'an-international-border').map((feature) => feature.featureId),
    ['osm:admin-border/2/100', 'osm:admin-border/2/200']
  );
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
