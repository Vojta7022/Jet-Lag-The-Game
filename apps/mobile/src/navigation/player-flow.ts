import type { MatchRole } from '../../../../packages/shared-types/src/index.ts';

import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';

export function isPregameState(lifecycleState: string | undefined) {
  return Boolean(lifecycleState) &&
    lifecycleState !== 'archived' &&
    !isLiveGameplayState(lifecycleState);
}

export function canAccessHostControls(
  role: MatchRole | 'spectator' | undefined,
  scope: string | undefined
) {
  return role === 'host' || scope === 'host_admin';
}

export function shouldRedirectSetupScreen(lifecycleState: string | undefined) {
  return isLiveGameplayState(lifecycleState);
}

export function formatLifecycleLabel(lifecycleState: string | undefined) {
  if (!lifecycleState) {
    return 'Waiting to connect';
  }

  return lifecycleState
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
