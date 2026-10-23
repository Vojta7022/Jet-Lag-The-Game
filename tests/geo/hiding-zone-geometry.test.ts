import assert from 'node:assert/strict';
import test from 'node:test';

import { circleWithinGeometry } from '../../packages/geo/src/index.ts';

const square = {
  type: 'Polygon',
  coordinates: [[[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]]]
};

test('a hiding circle is allowed only when the complete zone is inside the playable boundary', () => {
  assert.equal(circleWithinGeometry([14.5, 50.5], 500, square), true);
  assert.equal(circleWithinGeometry([14.002, 50.5], 500, square), false);
});

test('hiding circle validation rejects holes in the playable boundary', () => {
  const regionWithHole = {
    type: 'Polygon',
    coordinates: [
      [[14, 50], [15, 50], [15, 51], [14, 51], [14, 50]],
      [[14.45, 50.45], [14.55, 50.45], [14.55, 50.55], [14.45, 50.55], [14.45, 50.45]]
    ]
  };
  assert.equal(circleWithinGeometry([14.5, 50.5], 500, regionWithHole), false);
});
