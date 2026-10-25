import assert from 'node:assert/strict';
import test from 'node:test';

import {
  decodeMapScenario,
  encodeMapScenario,
  type MapScenario
} from '../src/features/map/map-scenarios.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';

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
});

test('map scenario decoder rejects malformed and unsupported payloads', () => {
  assert.throws(() => decodeMapScenario('not-json'), /valid map scenario/i);
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
