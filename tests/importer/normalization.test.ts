import assert from 'node:assert/strict';
import test from 'node:test';

import {
  normalizeLabel,
  normalizeScaleGate,
  parseDistanceValue,
  parseScaleAwareMinutes,
  parseScaleMinutes
} from '../../packages/content-import/src/normalization.ts';

test('normalization utilities clean workbook labels and build slugs', () => {
  const normalized = normalizeLabel('Amusment Park');

  assert.equal(normalized.displayText, 'Amusement Park');
  assert.equal(normalized.slug, 'amusement-park');
  assert.equal(normalized.corrected, true);
});

test('distance parsing prefers workbook metric values when present', () => {
  const distance = parseDistanceValue('0.50mi\n805m');

  assert.ok(distance);
  assert.equal(distance.meters, 805);
  assert.equal(distance.metricText, '805m');
});

test('scale gate and timer parsing normalize workbook rules text', () => {
  const scaleGate = normalizeScaleGate('Medium & Up');
  const timerByScale = parseScaleAwareMinutes('S/M: 10 Minutes L: 20 Minutes');
  const timeBonus = parseScaleMinutes('2m, 3m, 5m');

  assert.deepEqual(scaleGate, {
    appliesTo: ['medium', 'large'],
    rawLabel: 'Medium & Up'
  });
  assert.deepEqual(timerByScale, {
    small: 600,
    medium: 600,
    large: 1200
  });
  assert.deepEqual(timeBonus, {
    small: 2,
    medium: 3,
    large: 5
  });
});
