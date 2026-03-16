import type { MatchRole } from '../../../../packages/shared-types/src/index.ts';

import { isPregameState } from '../navigation/player-flow.ts';

export type ProductNavKey =
  | 'home'
  | 'lobby'
  | 'dashboard'
  | 'map'
  | 'questions'
  | 'cards'
  | 'chat'
  | 'dice'
  | 'movement'
  | 'admin'
  | 'status';

export interface ProductNavItem {
  key: ProductNavKey;
  label: string;
  href: string;
  group: 'primary' | 'secondary';
}

export interface ProductNavContext {
  hasActiveMatch: boolean;
  role: MatchRole | 'spectator';
  scope?: string;
  lifecycleState?: string;
  visibleCardCount: number;
  visibleMovementTrackCount: number;
  canAccessAdmin: boolean;
}

const HOME_NAV_ITEM: ProductNavItem = {
  key: 'home',
  label: 'Home',
  href: '/',
  group: 'primary'
};

export function buildProductNavItems(context: ProductNavContext): ProductNavItem[] {
  const items: ProductNavItem[] = [HOME_NAV_ITEM];
  const pregameState = isPregameState(context.lifecycleState);

  if (!context.hasActiveMatch) {
    return items;
  }

  if (pregameState) {
    items.push(
      { key: 'lobby', label: 'Match Room', href: '/lobby', group: 'primary' },
      { key: 'dashboard', label: 'Teams', href: '/dashboard', group: 'primary' },
      { key: 'map', label: 'Map Setup', href: '/map', group: 'primary' }
    );
  } else {
    items.push({ key: 'map', label: 'Live Map', href: '/map', group: 'primary' });
  }

  if (context.canAccessAdmin) {
    items.push(
      { key: 'status', label: 'Match Controls', href: '/status', group: 'secondary' }
    );
  }

  return items;
}
