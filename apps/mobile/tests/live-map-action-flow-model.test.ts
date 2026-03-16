import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchProjection } from '../../../packages/shared-types/src/index.ts';

import { resolveInlineLiveMapActionMode } from '../src/features/map/live-map-action-flow-model.ts';

const baseProjection: MatchProjection = {
  matchId: 'match-live-map-flow',
  contentPackId: 'pack-1',
  lifecycleState: 'seek_phase',
  seekPhaseSubstate: 'ready',
  players: [],
  teams: [],
  visibleMovementTracks: [],
  visibleChatChannels: [],
  visibleChatMessages: [],
  visibleAttachments: [],
  visibleCards: [],
  visibleQuestions: [],
  visibleConstraints: [],
  visibleTimers: [],
  visibleEventLog: []
};

test('inline live map flow opens the ask step for seekers when the next clue is ready', () => {
  assert.equal(resolveInlineLiveMapActionMode('seeker', baseProjection), 'ask');
  assert.equal(
    resolveInlineLiveMapActionMode('host', {
      ...baseProjection,
      seekPhaseSubstate: 'awaiting_question_selection'
    }),
    'ask'
  );
});

test('inline live map flow opens the answer step for hider and host views when a clue is live', () => {
  const awaitingAnswer = {
    ...baseProjection,
    seekPhaseSubstate: 'awaiting_question_answer'
  } satisfies MatchProjection;

  assert.equal(resolveInlineLiveMapActionMode('hider', awaitingAnswer), 'answer');
  assert.equal(resolveInlineLiveMapActionMode('host', awaitingAnswer), 'answer');
  assert.equal(resolveInlineLiveMapActionMode('seeker', awaitingAnswer), undefined);
});

test('inline live map flow opens the apply step only for hosts during constraint application', () => {
  const applyingConstraints = {
    ...baseProjection,
    seekPhaseSubstate: 'applying_constraints'
  } satisfies MatchProjection;

  assert.equal(resolveInlineLiveMapActionMode('host', applyingConstraints), 'apply');
  assert.equal(resolveInlineLiveMapActionMode('hider', applyingConstraints), undefined);
});

test('inline live map flow stays closed when the match is paused or not in live seek play', () => {
  assert.equal(
    resolveInlineLiveMapActionMode('seeker', {
      ...baseProjection,
      paused: {
        reason: 'manual_pause',
        pausedAt: '2026-03-16T10:00:00.000Z',
        pausedByRole: 'host',
        resumeLifecycleState: 'seek_phase',
        resumeSeekPhaseSubstate: 'ready'
      }
    }),
    undefined
  );
  assert.equal(
    resolveInlineLiveMapActionMode('seeker', {
      ...baseProjection,
      lifecycleState: 'hide_phase',
      seekPhaseSubstate: undefined
    }),
    undefined
  );
});
