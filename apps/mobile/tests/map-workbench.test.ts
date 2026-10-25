import assert from 'node:assert/strict';
import test from 'node:test';

import { combineStationSources, parseCustomOverlayGeoJson, parseCustomStationsCsv, parseCustomStationsGeoJson, parseCustomStationsKml } from '../src/features/map/map-workbench.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';

test('GeoJSON editor imports named features from a FeatureCollection as independently editable layers', () => {
  const layers = parseCustomOverlayGeoJson(JSON.stringify({
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'River' }, geometry: { type: 'LineString', coordinates: [[14, 50], [14.1, 50.1]] } },
      { type: 'Feature', properties: { name: 'Park' }, geometry: { type: 'Polygon', coordinates: [[[14, 50], [14.1, 50], [14.1, 50.1], [14, 50]]] } }
    ]
  }), { name: 'Imported map data', color: '#2374ab' });

  assert.equal(layers.length, 2);
  assert.deepEqual(layers.map((layer) => layer.name), ['River', 'Park']);
  assert.equal(layers[0]?.visible, true);
});

test('GeoJSON editor rejects invalid geometries instead of silently dropping them', () => {
  assert.throws(() => parseCustomOverlayGeoJson(JSON.stringify({
    type: 'Feature',
    properties: { name: 'Bad point' },
    geometry: { type: 'Point', coordinates: [300, 50] }
  }), { name: 'Bad point', color: '#2374ab' }), /valid GeoJSON/i);
});

test('custom station CSV import reads named columns and rejects out-of-range coordinates', () => {
  assert.deepEqual(parseCustomStationsCsv('name,latitude,longitude\nMuseum,50.08,14.43'), [
    { id: 'custom:csv:2', name: 'Museum', latitude: 50.08, longitude: 14.43 }
  ]);
  assert.throws(() => parseCustomStationsCsv('name,latitude,longitude\nNowhere,95,14'), /station data/i);
  assert.throws(() => parseCustomStationsCsv('name,latitude,longitude\nUnknown,,14'), /station data/i);
});

test('custom station GeoJSON import uses point features and preserves names', () => {
  assert.deepEqual(parseCustomStationsGeoJson(JSON.stringify({
    type: 'FeatureCollection',
    features: [{ type: 'Feature', properties: { name: 'Old Town' }, geometry: { type: 'Point', coordinates: [14.42, 50.08] } }]
  })), [{ id: 'custom:geojson:1', name: 'Old Town', latitude: 50.08, longitude: 14.42 }]);
});

test('custom station KML import reads placemark names and point coordinates', () => {
  const kml = '<kml><Placemark><name>River Stop</name><Point><coordinates>14.42,50.08,0</coordinates></Point></Placemark></kml>';
  assert.deepEqual(parseCustomStationsKml(kml), [{
    id: 'custom:kml:1', name: 'River Stop', latitude: 50.08, longitude: 14.42
  }]);
});

test('station source selection returns only in-boundary OSM and custom candidates', () => {
  const geometry = seedPlayableRegions[0]!.geometry;
  const osm = [{ stationId: 'node/1', name: 'OSM', latitude: 50.3, longitude: 14.4 }];
  const custom = [
    { id: 'c1', name: 'Custom', latitude: 50.3, longitude: 14.4 },
    { id: 'c2', name: 'Outside', latitude: 0, longitude: 0 }
  ];

  assert.deepEqual(combineStationSources('custom', geometry, osm, custom).map((station) => station.stationId), ['custom:c1']);
  assert.deepEqual(combineStationSources('both', geometry, osm, custom).map((station) => station.stationId), ['custom:c1', 'node/1']);
});
