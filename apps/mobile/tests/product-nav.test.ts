import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductNavItems } from '../src/components/product-nav-model.ts';

test('product nav keeps the player path focused on main match screens', () => {
  const items = buildProductNavItems({
    hasActiveMatch: true,
    role: 'hider',
    lifecycleState: 'lobby',
    visibleCardCount: 4,
    visibleMovementTrackCount: 0,
    canAccessAdmin: false
  });

  assert.deepEqual(
    items.map((item) => item.key),
    ['home', 'lobby', 'dashboard', 'map', 'questions', 'chat', 'dice', 'cards']
  );
});

test('product nav keeps referee and connection tools out of the normal player path', () => {
  const items = buildProductNavItems({
    hasActiveMatch: true,
    role: 'host',
    lifecycleState: 'role_assignment',
    visibleCardCount: 2,
    visibleMovementTrackCount: 2,
    canAccessAdmin: true
  });

  assert.equal(items.find((item) => item.key === 'admin')?.group, 'secondary');
  assert.equal(items.find((item) => item.key === 'status')?.group, 'secondary');
  assert.equal(items.find((item) => item.key === 'map')?.label, 'Live Map');
});

test('product nav hides match-room setup navigation once live play begins', () => {
  const items = buildProductNavItems({
    hasActiveMatch: true,
    role: 'seeker',
    lifecycleState: 'seek_phase',
    visibleCardCount: 0,
    visibleMovementTrackCount: 2,
    canAccessAdmin: false
  });

  assert.equal(items.some((item) => item.key === 'lobby'), false);
  assert.equal(items.some((item) => item.key === 'map'), true);
});
