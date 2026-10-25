import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMapScenario,
  decodeMapScenarioJson,
  encodeMapScenario,
  encodeMapScenarioJson,
  type MapScenario
} from '../src/features/map/map-scenarios.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';

test('map scenarios preserve region geometry and selected station across a share payload round trip', () => {
  const scenario: MapScenario = {
    version: 1,
    name: 'Prague night game',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: 'Prague',
    selectedPreviewRegionId: 'prague',
    selectedRegions: [seedPlayableRegions[0]!],
    excludedRegions: [seedPlayableRegions[1]!],
    selectedStation: {
      stationId: 'node/123',
      name: 'Main Station',
      latitude: 50.0833,
      longitude: 14.435
    },
    hidingRadiusMeters: 500
  };

  assert.deepEqual(decodeMapScenario(encodeMapScenario(scenario)), scenario);
  assert.deepEqual(decodeMapScenarioJson(encodeMapScenarioJson(scenario)), scenario);
});

test('map scenario decoder rejects malformed and unsupported payloads', () => {
  assert.throws(() => decodeMapScenario('not-json'), /valid map scenario/i);
  assert.throws(() => decodeMapScenarioJson('{"version":99}'), /unsupported/i);
  assert.throws(() => decodeMapScenarioJson('{'), /valid map scenario/i);
  assert.throws(() => decodeMapScenario(encodeMapScenario({ version: 99 } as MapScenario)), /unsupported/i);
  const invalid = {
    version: 1,
    name: 'Broken map',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: '',
    selectedRegions: [{ ...seedPlayableRegions[0]!, geometry: { type: 'Polygon', coordinates: [] } }]
  } as unknown as MapScenario;
  assert.throws(() => decodeMapScenario(encodeMapScenario(invalid)), /valid map scenario/i);
  const invalidExclusion = {
    version: 1,
    name: 'Broken subtraction',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: '',
    selectedRegions: [seedPlayableRegions[0]!],
    excludedRegions: [{ ...seedPlayableRegions[1]!, geometry: { type: 'Polygon', coordinates: [] } }]
  } as unknown as MapScenario;
  assert.throws(() => decodeMapScenario(encodeMapScenario(invalidExclusion)), /valid map scenario/i);
});

test('map scenario decoder rejects custom overlay coordinates outside geographic bounds', () => {
  const invalid = {
    version: 1,
    name: 'Broken overlay',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: 'Prague',
    selectedRegions: [seedPlayableRegions[0]!],
    customOverlays: [{
      id: 'danger-zone',
      name: 'Danger zone',
      color: '#ff0000',
      visible: true,
      geometry: { type: 'Point', coordinates: [220, 50] }
    }]
  };

  assert.throws(() => decodeMapScenarioJson(JSON.stringify(invalid)), /valid map scenario/i);
});

test('map scenario round trip preserves custom layers and station source settings', () => {
  const scenario = {
    version: 1 as const,
    name: 'Prague layers',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: 'Prague',
    selectedRegions: [seedPlayableRegions[0]!],
    customOverlays: [{
      id: 'river',
      name: 'River route',
      color: '#2374ab',
      visible: true,
      geometry: { type: 'LineString', coordinates: [[14.4, 50.0], [14.5, 50.1]] }
    }],
    stationSource: 'both' as const,
    customStations: [{ id: 'station-1', name: 'Custom stop', latitude: 50.08, longitude: 14.43 }]
  };

  assert.deepEqual(decodeMapScenario(encodeMapScenario(scenario as MapScenario)), scenario);
});

test('map scenario round trip preserves the host-confirmed bridge availability', () => {
  const scenario: MapScenario = {
    version: 1,
    name: 'Bridge-free city',
    savedAt: '2026-10-24T12:00:00.000Z',
    query: 'Prague',
    selectedRegions: [seedPlayableRegions[0]!],
    bridgeAvailability: 'none'
  };

  assert.deepEqual(decodeMapScenario(encodeMapScenario(scenario)), scenario);
  assert.throws(() => decodeMapScenarioJson(JSON.stringify({ ...scenario, bridgeAvailability: 'maybe' })), /valid map scenario/i);
});

test('custom scenario overlays are included in the map render model', () => {
  const overlay = {
    id: 'route',
    name: 'Escape route',
    color: '#2374ab',
    visible: true,
    geometry: { type: 'LineString', coordinates: [[14.4, 50], [14.5, 50.1]] }
  };
  const model = buildMapOverlayModel({ customOverlays: [overlay] });

  assert.equal(model.overlays.at(-1)?.overlayId, 'custom:route');
  assert.equal(model.overlays.at(-1)?.label, 'Escape route');
  assert.equal(model.overlays.at(-1)?.stroke, '#2374ab');
});
