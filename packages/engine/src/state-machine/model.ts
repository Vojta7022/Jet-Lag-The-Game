import type {
  MatchAggregate,
  MatchLifecycleState,
  SeekPhaseSubstate
} from '../../../shared-types/src/index.ts';

export function getStateKey(aggregate: MatchAggregate): string {
  if (aggregate.lifecycleState !== 'seek_phase') {
    return aggregate.lifecycleState;
  }

  return aggregate.seekPhaseSubstate
    ? `seek_phase.${aggregate.seekPhaseSubstate}`
    : aggregate.lifecycleState;
}

export function isSeekPhaseState(
  aggregate: MatchAggregate,
  expectedSubstate?: SeekPhaseSubstate
): boolean {
  if (aggregate.lifecycleState !== 'seek_phase') {
    return false;
  }

  if (!expectedSubstate) {
    return true;
  }

  return aggregate.seekPhaseSubstate === expectedSubstate;
}

export function isLifecycleState(
  aggregate: MatchAggregate,
  expectedState: MatchLifecycleState
): boolean {
  return aggregate.lifecycleState === expectedState;
}
