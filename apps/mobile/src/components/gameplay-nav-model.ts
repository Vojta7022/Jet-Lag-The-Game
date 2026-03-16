import type { MatchRole } from '../../../../packages/shared-types/src/index.ts';

export type GameplayTabKey = 'map' | 'questions' | 'deck' | 'chat' | 'dice';

export interface GameplayTabItem {
  key: GameplayTabKey;
  label: string;
  href: string;
}

export interface GameplayTabContext {
  role: MatchRole | 'spectator';
  visibleCardCount: number;
}

export function isLiveGameplayState(lifecycleState: string | undefined) {
  return lifecycleState === 'hide_phase' ||
    lifecycleState === 'seek_phase' ||
    lifecycleState === 'endgame' ||
    lifecycleState === 'game_complete';
}

export function buildGameplayTabItems(context: GameplayTabContext): GameplayTabItem[] {
  const items: GameplayTabItem[] = [
    { key: 'map', label: 'Map', href: '/map' },
    { key: 'questions', label: 'Questions', href: '/questions' }
  ];

  if (context.role === 'host' || context.role === 'hider' || context.visibleCardCount > 0) {
    items.push({ key: 'deck', label: 'Deck', href: '/cards' });
  }

  items.push(
    { key: 'chat', label: 'Chat', href: '/chat' },
    { key: 'dice', label: 'Dice', href: '/dice' }
  );

  return items;
}
