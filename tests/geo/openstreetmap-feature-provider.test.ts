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
    featureClassIds: ['unmapped-type'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });
  assert.equal(result, undefined);
});

test('rail station lookup includes mapped tram stops and public transport stations', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_url, init) => {
      submittedQuery = new URLSearchParams(String(init?.body)).get('data') ?? '';
      return new Response(JSON.stringify({ elements: [] }), { status: 200 });
    }
  });
  await provider.load({
    featureClassIds: ['rail-station'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.match(submittedQuery, /railway.*tram_stop/);
  assert.match(submittedQuery, /public_transport.*station/);
});

test('OpenStreetMap provider joins both directions of named subway routes into metro line candidates', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        {
          type: 'relation', id: 601,
          tags: { type: 'route', route: 'subway', network: 'Metro City', ref: 'A', name: 'Line A' },
          members: [{ type: 'way', ref: 1, role: '', geometry: [
            { lon: 0.1, lat: 0.5 }, { lon: 0.5, lat: 0.5 }
          ] }]
        },
        {
          type: 'relation', id: 602,
          tags: { type: 'route', route: 'subway', network: 'Metro City', ref: 'A', name: 'Line A' },
          members: [{ type: 'way', ref: 2, role: '', geometry: [
            { lon: 0.5, lat: 0.5 }, { lon: 0.9, lat: 0.5 }
          ] }]
        },
        {
          type: 'relation', id: 603,
          tags: { type: 'route', route: 'subway', network: 'Metro City', ref: 'B', name: 'Line B' },
          members: [{ type: 'way', ref: 3, role: '', geometry: [
            { lon: 0.1, lat: 0.7 }, { lon: 0.9, lat: 0.7 }
          ] }]
        }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['metro-lines'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /relation.*route.*subway/);
  assert.match(submittedQuery, /out body geom/);
  assert.equal(dataset.features.length, 2);
  const lineA = dataset.features.find((feature) => feature.label === 'A (Metro City)');
  assert.equal(lineA?.featureClassId, 'metro-lines');
  assert.equal(lineA?.geometrySupport, 'line');
  assert.deepEqual(lineA?.properties?.relationIds, [601, 602]);
  assert.equal(lineA?.geometry?.type, 'MultiLineString');
});

test('OpenStreetMap provider keeps incomplete subway route geometry out of automatic answers', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async () => new Response(JSON.stringify({ elements: [{
      type: 'relation', id: 604,
      tags: { type: 'route', route: 'subway', ref: 'C' },
      members: [{ type: 'way', ref: 4, role: '' }]
    }] }), { status: 200 })
  });

  const dataset = await provider.load({
    featureClassIds: ['metro-lines'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.equal(dataset, undefined);
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

test('OpenStreetMap provider loads named water shapes, excludes pools, and preserves relation holes', async () => {
  let submittedQuery = '';
  const ring = (minX: number, minY: number, maxX: number, maxY: number) => [
    { lon: minX, lat: minY }, { lon: maxX, lat: minY }, { lon: maxX, lat: maxY },
    { lon: minX, lat: maxY }, { lon: minX, lat: minY }
  ];
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        { type: 'way', id: 301, nodes: [1, 2, 3, 4, 1], geometry: ring(0.2, 0.2, 0.4, 0.4), tags: { natural: 'water', water: 'lake', name: 'Blue Lake' } },
        { type: 'way', id: 302, nodes: [5, 6, 7, 8, 5], geometry: ring(0.5, 0.5, 0.6, 0.6), tags: { natural: 'water', water: 'pool', leisure: 'swimming_pool', name: 'Garden Pool' } },
        { type: 'relation', id: 303, tags: { type: 'multipolygon', natural: 'water', water: 'lake', name: 'Island Lake' }, members: [
          { type: 'way', ref: 30, role: 'outer', geometry: ring(0.65, 0.2, 0.85, 0.4) },
          { type: 'way', ref: 31, role: 'inner', geometry: ring(0.7, 0.25, 0.75, 0.3) }
        ] }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['a-body-of-water'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.ok(dataset);
  assert.match(submittedQuery, /natural.*water/);
  assert.match(submittedQuery, /out geom tags/);
  assert.deepEqual(dataset.features.map((feature) => feature.label).sort(), ['Blue Lake', 'Island Lake']);
  const blueLake = dataset.features.find((feature) => feature.label === 'Blue Lake');
  const islandLake = dataset.features.find((feature) => feature.label === 'Island Lake');
  assert.equal(blueLake?.geometry?.type, 'Polygon');
  assert.equal(islandLake?.geometry?.type, 'MultiPolygon');
  assert.equal(islandLake?.geometry?.type === 'MultiPolygon'
    ? islandLake.geometry.coordinates[0]?.length : 0, 2);
});

test('OpenStreetMap provider loads named river ways as water-body line geometry', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [{
        type: 'way', id: 304,
        geometry: [{ lon: 0.1, lat: 0.5 }, { lon: 0.5, lat: 0.51 }, { lon: 0.9, lat: 0.52 }],
        tags: { waterway: 'river', name: 'Named River' }
      }] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['a-body-of-water'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.match(submittedQuery, /waterway.*river/);
  assert.equal(dataset?.features.length, 1);
  assert.equal(dataset?.features[0]?.label, 'Named River');
  assert.equal(dataset?.features[0]?.geometrySupport, 'line');
  assert.equal(dataset?.features[0]?.geometry?.type, 'LineString');
});

test('OpenStreetMap water provider refuses automatic data when a named area boundary is incomplete', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async () => new Response(JSON.stringify({ elements: [{
      type: 'relation', id: 401,
      tags: { type: 'multipolygon', natural: 'water', water: 'lake', name: 'Incomplete Lake' },
      members: [{ type: 'way', ref: 40, role: 'outer', geometry: [{ lon: 0, lat: 0 }, { lon: 1, lat: 1 }] }]
    }] }), { status: 200 })
  });

  const dataset = await provider.load({
    featureClassIds: ['a-body-of-water'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.equal(dataset, undefined);
});

test('OpenStreetMap provider loads coastline ways as lines clipped to the playable region', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        {
          type: 'way', id: 501, nodes: [1, 2, 3],
          geometry: [{ lon: 0.2, lat: 0.1 }, { lon: 0.5, lat: 0.1 }, { lon: 0.8, lat: 0.1 }],
          tags: { natural: 'coastline' }
        },
        {
          type: 'way', id: 502, nodes: [4, 5],
          geometry: [{ lon: 2, lat: 2 }, { lon: 3, lat: 3 }],
          tags: { natural: 'coastline' }
        }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['a-coastline'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.ok(dataset);
  assert.equal(dataset.sourceVersion, 'overpass-question-features-v10');
  assert.match(submittedQuery, /way\["natural"="coastline"\]/);
  assert.equal(dataset.features.length, 1);
  assert.equal(dataset.features[0]?.featureClassId, 'a-coastline');
  assert.equal(dataset.features[0]?.geometrySupport, 'line');
  assert.deepEqual(dataset.features[0]?.geometry, {
    type: 'LineString', coordinates: [[0.2, 0.1], [0.5, 0.1], [0.8, 0.1]]
  });
});

test('OpenStreetMap provider loads only explicitly tagged high-speed rail ways as Measuring line targets', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    endpoint: 'https://overpass.example/api/interpreter',
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        {
          type: 'way', id: 801,
          tags: { railway: 'rail', highspeed: 'yes', name: 'Fast Line' },
          geometry: [{ lon: 0.2, lat: 0.5 }, { lon: 0.8, lat: 0.5 }]
        },
        {
          type: 'way', id: 802,
          tags: { railway: 'rail', usage: 'main', name: 'Ordinary Main Line' },
          geometry: [{ lon: 0.2, lat: 0.7 }, { lon: 0.8, lat: 0.7 }]
        }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['a-high-speed-train-line'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.match(submittedQuery, /way\["railway"="rail"\]\["highspeed"="yes"\]/);
  assert.ok(dataset);
  assert.equal(dataset.features.length, 1);
  assert.equal(dataset.features[0]?.featureId, 'osm:way/801');
  assert.equal(dataset.features[0]?.label, 'Fast Line');
  assert.equal(dataset.features[0]?.geometry?.type, 'LineString');
  assert.equal(dataset.features[0]?.featureClassId, 'a-high-speed-train-line');
});

test('OpenStreetMap provider assembles high-speed track route relations from member ways', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [{
        type: 'relation', id: 810,
        tags: { type: 'route', route: 'tracks', highspeed: 'yes', name: 'National High-Speed Route' },
        members: [
          { type: 'way', ref: 11, role: '', geometry: [{ lon: 0.1, lat: 0.5 }, { lon: 0.5, lat: 0.5 }] },
          { type: 'way', ref: 12, role: '', geometry: [{ lon: 0.5, lat: 0.5 }, { lon: 0.9, lat: 0.5 }] }
        ]
      }] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['a-high-speed-train-line'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.match(submittedQuery, /relation\["type"="route"\]\["route"="tracks"\]\["highspeed"="yes"\]/);
  assert.ok(dataset);
  assert.equal(dataset.features.length, 1);
  assert.equal(dataset.features[0]?.featureId, 'osm:relation/810');
  assert.equal(dataset.features[0]?.geometry?.type, 'MultiLineString');
  assert.equal(dataset.features[0]?.geometry?.type === 'MultiLineString' ? dataset.features[0].geometry.coordinates.length : 0, 2);
});

test('OpenStreetMap provider leaves High-Speed Train Line manual when the region has no tagged track', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async () => new Response(JSON.stringify({ elements: [
      {
        type: 'way', id: 802,
        tags: { railway: 'rail', usage: 'main', name: 'Ordinary Main Line' },
        geometry: [{ lon: 0.2, lat: 0.5 }, { lon: 0.8, lat: 0.5 }]
      }
    ] }), { status: 200 })
  });

  assert.equal(await provider.load({
    featureClassIds: ['a-high-speed-train-line'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  }), undefined);
});

test('OpenStreetMap provider loads island and islet polygons for scan-faithful Landmass Matching', async () => {
  let submittedQuery = '';
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async (_input, init) => {
      submittedQuery = decodeURIComponent(String(init?.body).replace(/^data=/, ''));
      return new Response(JSON.stringify({ elements: [
        {
          type: 'way', id: 901,
          tags: { place: 'island', name: 'Main Island' },
          geometry: [
            { lon: 0.1, lat: 0.1 }, { lon: 0.9, lat: 0.1 }, { lon: 0.9, lat: 0.9 },
            { lon: 0.1, lat: 0.9 }, { lon: 0.1, lat: 0.1 }
          ]
        },
        {
          type: 'relation', id: 902,
          tags: { place: 'islet', name: 'Inland Island' },
          members: [
            { type: 'way', ref: 92, role: 'outer', geometry: [
              { lon: 0.4, lat: 0.4 }, { lon: 0.6, lat: 0.4 }, { lon: 0.6, lat: 0.6 },
              { lon: 0.4, lat: 0.6 }, { lon: 0.4, lat: 0.4 }
            ] },
            { type: 'way', ref: 93, role: 'inner', geometry: [
              { lon: 0.45, lat: 0.45 }, { lon: 0.55, lat: 0.45 }, { lon: 0.55, lat: 0.55 },
              { lon: 0.45, lat: 0.55 }, { lon: 0.45, lat: 0.45 }
            ] }
          ]
        }
      ] }), { status: 200 });
    }
  });

  const dataset = await provider.load({
    featureClassIds: ['landmass'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  });

  assert.match(submittedQuery, /way\["place"~"\^\(island\|islet\)\$"\]/);
  assert.ok(dataset);
  assert.equal(dataset.features.length, 2);
  assert.equal(dataset.features[0]?.geometrySupport, 'polygon');
  assert.equal(dataset.features.find((feature) => feature.featureId === 'osm:relation/902')?.geometry?.type, 'MultiPolygon');
  assert.equal(dataset.features.find((feature) => feature.featureId === 'osm:relation/902')?.label, 'Inland Island');
});

test('OpenStreetMap provider leaves Landmass manual when only point or incomplete island geometry exists', async () => {
  const provider = new OpenStreetMapQuestionFeatureProvider({
    fetch: async () => new Response(JSON.stringify({ elements: [
      { type: 'node', id: 903, lon: 0.5, lat: 0.5, tags: { place: 'island', name: 'Unbounded Island' } }
    ] }), { status: 200 })
  });

  assert.equal(await provider.load({
    featureClassIds: ['landmass'],
    regionGeometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }
  }), undefined);
});

test('OpenStreetMap provider supports metro routes while leaving unknown classes manual', async () => {
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
  const metro = await provider.load({ featureClassIds: ['metro-lines'], regionGeometry });
  const unsupported = await provider.load({ featureClassIds: ['unknown-class'], regionGeometry });

  assert.ok(dataset);
  assert.ok(metro);
  assert.equal(submittedQueries.length, 3);
  assert.match(submittedQueries[0]!, /tourism.*museum/);
  assert.match(submittedQueries[1]!, /amenity.*library/);
  assert.match(submittedQueries[2]!, /route.*subway/);
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
