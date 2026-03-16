import assert from 'node:assert/strict';
import test from 'node:test';

import { buildProductNavItems } from '../src/components/product-nav-model.ts';

test('product nav keeps the player path focused on main match screens', () => {
  const items = buildProductNavItems({
    hasActiveMatch: true,
    role: 'hider',
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
    visibleCardCount: 2,
    visibleMovementTrackCount: 2,
    canAccessAdmin: true
  });

  assert.equal(items.find((item) => item.key === 'admin')?.group, 'secondary');
  assert.equal(items.find((item) => item.key === 'status')?.group, 'secondary');
  assert.equal(items.find((item) => item.key === 'map')?.label, 'Live Map');
});
