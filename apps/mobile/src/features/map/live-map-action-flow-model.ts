import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';

export type InlineLiveMapActionMode = 'ask' | 'answer' | 'apply' | undefined;

export function resolveInlineLiveMapActionMode(
  role: MatchRole,
  projection: MatchProjection | undefined
): InlineLiveMapActionMode {
  if (!projection || projection.paused) {
    return undefined;
  }

  if (projection.lifecycleState !== 'seek_phase') {
    return undefined;
  }

  if (
    (role === 'seeker' || role === 'host') &&
    (projection.seekPhaseSubstate === 'ready' || projection.seekPhaseSubstate === 'awaiting_question_selection')
  ) {
    return 'ask';
  }

  if (
    (role === 'hider' || role === 'host') &&
    projection.seekPhaseSubstate === 'awaiting_question_answer'
  ) {
    return 'answer';
  }

  if (role === 'host' && projection.seekPhaseSubstate === 'applying_constraints') {
    return 'apply';
  }

  return undefined;
}
