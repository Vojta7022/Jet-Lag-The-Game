import { createUuid } from './create-uuid.ts';
import type { SessionProfileDraft } from './types.ts';

function buildInternalPlayerId(): string {
  return `player-${createUuid().replace(/-/g, '').slice(0, 12)}`;
}

function buildInternalAuthUserId(playerId: string): string {
  return `device-${playerId}`;
}

export function buildFriendlyDisplayName(playerId: string): string {
  return `Player ${playerId.slice(-4).toUpperCase()}`;
}

export function createGeneratedSessionProfile(): SessionProfileDraft {
  const playerId = buildInternalPlayerId();

  return {
    displayName: buildFriendlyDisplayName(playerId),
    playerId,
    authUserId: buildInternalAuthUserId(playerId)
  };
}

export function normalizeDisplayName(
  nextDisplayName: string | undefined,
  fallbackProfile: SessionProfileDraft
): string {
  const trimmed = nextDisplayName?.trim();

  if (trimmed) {
    return trimmed;
  }

  return fallbackProfile.displayName || buildFriendlyDisplayName(fallbackProfile.playerId);
}
