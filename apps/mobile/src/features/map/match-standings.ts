import type { RoundResultModel } from '../../../../../packages/shared-types/src/domain/match.ts';

type StandingPlayer = { playerId: string; displayName: string };

export interface MatchStanding {
  playerId: string;
  displayName: string;
  scoreSeconds: number;
  place: number;
}

export function buildMatchStandings(
  players: readonly StandingPlayer[],
  results: readonly RoundResultModel[],
  rotationOrder: readonly string[]
): MatchStanding[] {
  const playersById = new Map(players.map((player) => [player.playerId, player]));
  const rows = results.flatMap((result, index) => {
    const playerId = result.hiderPlayerId ?? rotationOrder[index];
    const player = playerId ? playersById.get(playerId) : undefined;
    if (!player) return [];
    return [{
      playerId: player.playerId,
      displayName: player.displayName,
      scoreSeconds: result.finalHidingTimeSeconds ?? result.survivalSeconds,
      place: 0
    }];
  }).sort((left, right) => right.scoreSeconds - left.scoreSeconds || left.displayName.localeCompare(right.displayName));

  let priorScore: number | undefined;
  let place = 0;
  return rows.map((row, index) => {
    if (row.scoreSeconds !== priorScore) place = index + 1;
    priorScore = row.scoreSeconds;
    return { ...row, place };
  });
}

export function hasFinishedHiderRotation(
  rotationOrder: readonly string[],
  results: readonly RoundResultModel[]
): boolean {
  if (rotationOrder.length === 0) return false;
  const completedPlayers = new Set(results.map((result, index) => result.hiderPlayerId ?? rotationOrder[index]));
  return rotationOrder.every((playerId) => completedPlayers.has(playerId));
}
