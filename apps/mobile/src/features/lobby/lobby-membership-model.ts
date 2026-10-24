import type { MatchLifecycleState, MatchRole } from '../../../../../packages/shared-types/src/index.ts';

const PREGAME_STATES = new Set<MatchLifecycleState>([
  'draft', 'lobby', 'content_import', 'role_assignment', 'rules_confirmation', 'map_setup'
]);

export function canManageLobbyMembers(role: MatchRole | undefined, lifecycleState: MatchLifecycleState | undefined): boolean {
  return role === 'host' && lifecycleState !== undefined && PREGAME_STATES.has(lifecycleState);
}

export function canLeaveLobby(role: MatchRole | undefined, playerId: string | undefined, lifecycleState: MatchLifecycleState | undefined): boolean {
  return Boolean(playerId && role !== 'host' && lifecycleState && PREGAME_STATES.has(lifecycleState));
}

export function canRemoveLobbyPlayer(canManage: boolean, targetPlayerId: string, currentPlayerId: string | undefined): boolean {
  return canManage && targetPlayerId !== currentPlayerId;
}
