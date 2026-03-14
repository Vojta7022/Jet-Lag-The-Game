import type { MatchAggregate } from '../../../shared-types/src/index.ts';

export function hasLockedHiderLocation(aggregate: MatchAggregate): boolean {
  return Boolean(aggregate.hiddenState.hiderLocation);
}

export function hasActiveCardResolution(aggregate: MatchAggregate): boolean {
  return Boolean(aggregate.activeCardResolution);
}

export function hasActiveQuestion(aggregate: MatchAggregate): boolean {
  return Boolean(aggregate.activeQuestionInstanceId);
}

export function isPaused(aggregate: MatchAggregate): boolean {
  return Boolean(aggregate.paused);
}
