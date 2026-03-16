import type { MatchRole } from '../../../../packages/shared-types/src/index.ts';

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
  lifecycleState?: string;
  visibleCardCount: number;
  visibleMovementTrackCount: number;
  canAccessAdmin: boolean;
}

function isSetupFlowVisible(lifecycleState: string | undefined): boolean {
  return lifecycleState !== 'hide_phase' &&
    lifecycleState !== 'seek_phase' &&
    lifecycleState !== 'endgame' &&
    lifecycleState !== 'game_complete' &&
    lifecycleState !== 'archived';
}

const HOME_NAV_ITEM: ProductNavItem = {
  key: 'home',
  label: 'Home',
  href: '/',
  group: 'primary'
};

export function buildProductNavItems(context: ProductNavContext): ProductNavItem[] {
  const items: ProductNavItem[] = [HOME_NAV_ITEM];

  if (!context.hasActiveMatch) {
    return items;
  }

  items.push(
    { key: 'dashboard', label: 'Team', href: '/dashboard', group: 'primary' },
    { key: 'map', label: 'Live Map', href: '/map', group: 'primary' },
    { key: 'questions', label: 'Questions', href: '/questions', group: 'primary' },
    { key: 'chat', label: 'Chat', href: '/chat', group: 'primary' },
    { key: 'dice', label: 'Dice', href: '/dice', group: 'primary' }
  );

  if (isSetupFlowVisible(context.lifecycleState)) {
    items.splice(1, 0, { key: 'lobby', label: 'Match', href: '/lobby', group: 'primary' });
  }

  if (context.role === 'host' || context.role === 'hider' || context.visibleCardCount > 0) {
    items.push({ key: 'cards', label: 'Deck', href: '/cards', group: 'primary' });
  }

  if (context.role === 'host' || context.role === 'seeker' || context.visibleMovementTrackCount > 0) {
    items.push({ key: 'movement', label: 'Movement', href: '/movement', group: 'primary' });
  }

  if (context.canAccessAdmin) {
    items.push(
      { key: 'admin', label: 'Referee', href: '/admin', group: 'secondary' },
      { key: 'status', label: 'Connection', href: '/status', group: 'secondary' }
    );
  }

  return items;
}
