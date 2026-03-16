import assert from 'node:assert/strict';
import test from 'node:test';

import {
  filterCardIdsByVisibleHand,
  haveSameCardIdSequence,
  reconcileDrawTrayCardIds
} from '../src/features/cards/deck-ui-state.ts';

test('draw tray reconciliation only keeps current hand cards and prepends newly drawn cards once', () => {
  const nextTray = reconcileDrawTrayCardIds({
    currentTrayCardIds: ['card-2', 'card-1'],
    previousHandCardIds: ['card-1', 'card-2'],
    nextHandCardIds: ['card-1', 'card-2', 'card-3']
  });

  assert.deepEqual(nextTray, ['card-3', 'card-2', 'card-1']);
  assert.equal(haveSameCardIdSequence(nextTray, ['card-3', 'card-2', 'card-1']), true);
});

test('draw tray helpers return stable filtered selections when the visible hand has not changed', () => {
  const visibleHandCardIds = ['card-1', 'card-2'];
  const filteredResponseIds = filterCardIdsByVisibleHand(['card-2', 'card-9'], visibleHandCardIds);
  const nextTray = reconcileDrawTrayCardIds({
    currentTrayCardIds: ['card-2'],
    previousHandCardIds: visibleHandCardIds,
    nextHandCardIds: visibleHandCardIds
  });

  assert.deepEqual(filteredResponseIds, ['card-2']);
  assert.deepEqual(nextTray, ['card-2']);
  assert.equal(haveSameCardIdSequence(nextTray, ['card-2']), true);
});
