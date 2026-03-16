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

const GAMEPLAY_TAB_ITEMS: Record<GameplayTabKey, GameplayTabItem> = {
  map: { key: 'map', label: 'Map', href: '/map' },
  questions: { key: 'questions', label: 'Questions', href: '/questions' },
  deck: { key: 'deck', label: 'Deck', href: '/cards' },
  chat: { key: 'chat', label: 'Chat', href: '/chat' },
  dice: { key: 'dice', label: 'Dice', href: '/dice' }
};

export function isLiveGameplayState(lifecycleState: string | undefined) {
  return lifecycleState === 'hide_phase' ||
    lifecycleState === 'seek_phase' ||
    lifecycleState === 'endgame' ||
    lifecycleState === 'game_complete';
}

export function buildGameplayTabItems(
  context: GameplayTabContext,
  current?: GameplayTabKey
): GameplayTabItem[] {
  const items: GameplayTabItem[] = [GAMEPLAY_TAB_ITEMS.map];

  if (context.role === 'host' || context.role === 'seeker') {
    items.push(GAMEPLAY_TAB_ITEMS.questions);
  }

  if (context.role === 'host' || context.role === 'hider' || context.visibleCardCount > 0) {
    items.push(GAMEPLAY_TAB_ITEMS.deck);
  }

  items.push(GAMEPLAY_TAB_ITEMS.chat, GAMEPLAY_TAB_ITEMS.dice);

  if (current && !items.some((item) => item.key === current)) {
    items.splice(1, 0, GAMEPLAY_TAB_ITEMS[current]);
  }

  return items;
}
