import assert from 'node:assert/strict';
import test from 'node:test';

import { buildGameplayTabItems, isLiveGameplayState } from '../src/components/gameplay-nav-model.ts';

test('gameplay tab bar keeps the live player flow focused on map, questions, deck, chat, and dice', () => {
  const hiderItems = buildGameplayTabItems({
    role: 'hider',
    visibleCardCount: 6
  });
  const seekerItems = buildGameplayTabItems({
    role: 'seeker',
    visibleCardCount: 0
  });

  assert.deepEqual(
    hiderItems.map((item) => item.key),
    ['map', 'questions', 'deck', 'chat', 'dice']
  );
  assert.deepEqual(
    seekerItems.map((item) => item.key),
    ['map', 'questions', 'chat', 'dice']
  );
  assert.equal(isLiveGameplayState('seek_phase'), true);
  assert.equal(isLiveGameplayState('map_setup'), false);
});
