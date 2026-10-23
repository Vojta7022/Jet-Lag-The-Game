import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';

export type InlineLiveMapActionMode = 'ask' | 'answer' | 'apply' | undefined;

export function resolveInlineLiveMapActionMode(
  role: MatchRole,
  projection: MatchProjection | undefined
): InlineLiveMapActionMode {
  if (!projection || projection.paused) {
    return undefined;
  }

  if (projection.lifecycleState !== 'seek_phase' && projection.lifecycleState !== 'endgame') {
    return undefined;
  }

  const substate = projection.seekPhaseSubstate ??
    (projection.lifecycleState === 'endgame' ? 'ready' : undefined);

  if (
    (role === 'seeker' || role === 'host') &&
    (substate === 'ready' || substate === 'awaiting_question_selection')
  ) {
    return 'ask';
  }

  if (
    (role === 'hider' || role === 'host') &&
    substate === 'awaiting_question_answer'
  ) {
    return 'answer';
  }

  if (role === 'host' && substate === 'applying_constraints') {
    return 'apply';
  }

  return undefined;
}
