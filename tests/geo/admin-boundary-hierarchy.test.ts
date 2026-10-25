import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assembleAdministrativeBoundary,
  buildSharedAdministrativeBorders,
  distanceToAdministrativeBoundaryMeters,
  distanceToFeatureMeters,
  lineGeometryIntersectsPolygon,
  selectAdministrativeDivisionAtPoint
} from '../../packages/geo/src/features/admin-boundary-hierarchy.ts';
import { pointInGeometry } from '../../packages/geo/src/geometry/geojson.ts';

test('assembles a tagged OSM boundary relation from connected outer member ways', () => {
  const feature = assembleAdministrativeBoundary({
    type: 'relation',
    id: 42,
    tags: { boundary: 'administrative', admin_level: '6', name: 'Example County' },
    members: [
      { type: 'way', role: 'outer', geometry: [{ lon: 0, lat: 0 }, { lon: 2, lat: 0 }, { lon: 2, lat: 2 }] },
      { type: 'way', role: 'outer', geometry: [{ lon: 0, lat: 2 }, { lon: 0, lat: 0 }] },
      { type: 'way', role: 'outer', geometry: [{ lon: 2, lat: 2 }, { lon: 0, lat: 2 }] },
      { type: 'way', role: 'inner', geometry: [
        { lon: 0.8, lat: 0.8 }, { lon: 1.2, lat: 0.8 }, { lon: 1.2, lat: 1.2 },
        { lon: 0.8, lat: 1.2 }, { lon: 0.8, lat: 0.8 }
      ] }
    ]
  });

  assert.ok(feature);
  assert.equal(feature.featureId, 'osm:relation/42');
  assert.equal(feature.label, 'Example County');
  assert.equal(feature.properties?.adminLevel, 6);
  assert.equal(feature.geometry?.type, 'MultiPolygon');
  assert.equal(pointInGeometry([0.5, 0.5], feature.geometry), true);
  assert.equal(pointInGeometry([1, 1], feature.geometry), false);
});

test('selects the Nth containing administrative division by available boundary hierarchy', () => {
  const boundaries = [
    boundary(10, 2, -5, 5, 'Country'),
    boundary(11, 4, -4, 4, 'State'),
    boundary(12, 6, -3, 3, 'County'),
    boundary(13, 8, -2, 2, 'Municipality')
  ];

  assert.equal(selectAdministrativeDivisionAtPoint(boundaries, [0, 0], 1)?.featureId, 'osm:relation/11');
  assert.equal(selectAdministrativeDivisionAtPoint(boundaries, [0, 0], 2)?.featureId, 'osm:relation/12');
  assert.equal(selectAdministrativeDivisionAtPoint(boundaries, [0, 0], 3)?.featureId, 'osm:relation/13');
  assert.equal(selectAdministrativeDivisionAtPoint(boundaries, [0, 0], 4), undefined);
});

test('does not guess when the requested division is not mapped or equally ranked boundaries overlap', () => {
  const boundaries = [
    boundary(10, 2, -5, 5, 'Country'),
    boundary(11, 4, -4, 4, 'State'),
    boundary(12, 4, -4, 4, 'State duplicate')
  ];

  assert.equal(selectAdministrativeDivisionAtPoint(boundaries, [0, 0], 1), undefined);
  assert.equal(selectAdministrativeDivisionAtPoint([
    boundary(20, 2, -5, 5, 'Country'),
    boundary(21, 4, -4, 4, 'State'),
    boundary(22, 8, -2, 2, 'Municipality')
  ], [0, 0], 2), undefined);
});

test('measures location uncertainty against the selected administrative border', () => {
  const state = boundary(30, 4, -1, 1, 'State');
  assert.ok(Math.abs(distanceToAdministrativeBoundaryMeters([0, 0], state)! - 111_132) < 5);
  assert.ok(distanceToAdministrativeBoundaryMeters([0.99999, 0], state)! < 2);
});

test('distance to a mapped water area is zero when the location is inside its polygon', () => {
  const lake = {
    geometrySupport: 'polygon' as const,
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: [[
        [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]],
        [[0.8, 0.8], [1.2, 0.8], [1.2, 1.2], [0.8, 1.2], [0.8, 0.8]]
      ]]
    }
  };

  assert.equal(distanceToFeatureMeters([0.5, 0.5], lake), 0);
  assert.ok(distanceToFeatureMeters([1, 1], lake)! > 20_000);
});

test('builds measuring targets only from ways shared by divisions at the requested level', () => {
  const features = [
    administrativeArea(40, 4, 'West State', [
      { wayId: 100, coordinates: [[1, 0], [1, 2]] },
      { wayId: 101, coordinates: [[0, 0], [1, 0]] }
    ]),
    administrativeArea(41, 4, 'East State', [
      { wayId: 100, coordinates: [[1, 0], [1, 2]] },
      { wayId: 102, coordinates: [[1, 0], [2, 0]] }
    ]),
    administrativeArea(42, 6, 'West County', [
      { wayId: 100, coordinates: [[1, 0], [1, 2]] }
    ])
  ];

  const borders = buildSharedAdministrativeBorders(features, 1, 'a-1st-admin-border-state', '1st Admin State Border');

  assert.equal(borders.length, 1);
  assert.equal(borders[0]?.featureId, 'osm:admin-border/4/100');
  assert.equal(borders[0]?.featureClassId, 'a-1st-admin-border-state');
  assert.deepEqual(borders[0]?.geometry, { type: 'MultiLineString', coordinates: [[[1, 0], [1, 2]]] });
  assert.ok(Math.abs(distanceToFeatureMeters([0.9, 1], borders[0]!)! - 11_132) < 5);
  assert.equal(lineGeometryIntersectsPolygon(borders[0]?.geometry, {
    type: 'Polygon', coordinates: [[[0.95, 0.2], [1.05, 0.2], [1.05, 1.8], [0.95, 1.8], [0.95, 0.2]]]
  }), true);
  assert.equal(lineGeometryIntersectsPolygon(borders[0]?.geometry, {
    type: 'Polygon', coordinates: [[[2, 0], [3, 0], [3, 2], [2, 2], [2, 0]]]
  }), false);
});

function boundary(id: number, adminLevel: number, min: number, max: number, name: string) {
  return {
    featureId: `osm:relation/${id}`,
    featureClassId: 'admin-boundary',
    label: name,
    latitude: 0,
    longitude: 0,
    geometrySupport: 'polygon' as const,
    coverage: 'approximate' as const,
    properties: { adminLevel },
    geometry: {
      type: 'MultiPolygon' as const,
      coordinates: [[[[min, min], [max, min], [max, max], [min, max], [min, min]]]]
    }
  };
}

function administrativeArea(
  id: number,
  adminLevel: number,
  name: string,
  ways: Array<{ wayId: number; coordinates: number[][] }>
) {
  return {
    featureId: `osm:relation/${id}`,
    featureClassId: 'admin-boundary',
    label: name,
    latitude: 0,
    longitude: 0,
    geometrySupport: 'polygon' as const,
    coverage: 'approximate' as const,
    properties: { adminLevel, adminBoundaryWays: ways },
    geometry: { type: 'MultiPolygon', coordinates: [] }
  };
}
