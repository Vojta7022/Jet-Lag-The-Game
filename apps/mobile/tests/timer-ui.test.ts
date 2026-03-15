import assert from 'node:assert/strict';
import test from 'node:test';

import type { MatchProjection } from '../../../packages/shared-types/src/index.ts';

import {
  buildMatchTimingDisplayModel,
  formatCountdown
} from '../src/features/timers/timer-model.ts';

function createProjection(overrides: Partial<MatchProjection> = {}): MatchProjection {
  return {
    matchId: 'match-timer-test',
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
    visibleEventLog: [],
    ...overrides
  };
}

test('formatCountdown uses compact match-friendly formatting', () => {
  assert.equal(formatCountdown(5), '0:05');
  assert.equal(formatCountdown(75), '1:15');
  assert.equal(formatCountdown(3723), '1:02:03');
});

test('hide phase timer counts down from the latest synced projection', () => {
  const model = buildMatchTimingDisplayModel({
    projection: createProjection({
      lifecycleState: 'hide_phase',
      visibleTimers: [
        {
          timerId: 'hide-phase',
          kind: 'hide',
          status: 'running',
          remainingSeconds: 180
        }
      ]
    }),
    freshnessAt: '2026-03-15T10:00:00.000Z',
    nowMs: Date.parse('2026-03-15T10:00:30.000Z')
  });

  assert.ok(model);
  assert.equal(model?.timers[0]?.remainingSeconds, 150);
  assert.equal(model?.timers[0]?.remainingLabel, '2:30');
  assert.equal(model?.banner?.title, 'Hide phase: 2:30 remaining');
});

test('question cooldown banner stays explicit during cooldown state', () => {
  const model = buildMatchTimingDisplayModel({
    projection: createProjection({
      lifecycleState: 'seek_phase',
      seekPhaseSubstate: 'cooldown',
      visibleTimers: [
        {
          timerId: 'cooldown-1',
          kind: 'cooldown',
          status: 'running',
          remainingSeconds: 45
        }
      ]
    }),
    freshnessAt: '2026-03-15T10:05:00.000Z',
    nowMs: Date.parse('2026-03-15T10:05:10.000Z')
  });

  assert.ok(model);
  assert.equal(model?.timers[0]?.remainingLabel, '0:35');
  assert.equal(model?.flowLockSummary, 'Question cooldown');
  assert.equal(model?.banner?.title, 'Question cooldown: 0:35 remaining');
});

test('paused match keeps timer values frozen and explains the resume target', () => {
  const model = buildMatchTimingDisplayModel({
    projection: createProjection({
      lifecycleState: 'seek_phase',
      seekPhaseSubstate: 'cooldown',
      paused: {
        reason: 'Referee timeout',
        pausedAt: '2026-03-15T10:10:00.000Z',
        pausedByPlayerId: 'host-1',
        pausedByRole: 'host',
        resumeLifecycleState: 'seek_phase',
        resumeSeekPhaseSubstate: 'cooldown'
      },
      visibleTimers: [
        {
          timerId: 'cooldown-2',
          kind: 'cooldown',
          status: 'paused',
          remainingSeconds: 25
        }
      ]
    }),
    freshnessAt: '2026-03-15T10:10:00.000Z',
    nowMs: Date.parse('2026-03-15T10:11:30.000Z')
  });

  assert.ok(model);
  assert.equal(model?.timers[0]?.remainingSeconds, 25);
  assert.equal(model?.banner?.title, 'Match paused');
  assert.match(model?.pauseDetail ?? '', /Timers are frozen/);
  assert.match(model?.pauseDetail ?? '', /seek_phase \/ cooldown/);
});

test('card windows stay honest when there is a lock but no countdown timer', () => {
  const model = buildMatchTimingDisplayModel({
    projection: createProjection({
      lifecycleState: 'seek_phase',
      seekPhaseSubstate: 'awaiting_card_resolution',
      activeCardResolution: {
        sourceCardInstanceId: 'card-1'
      }
    }),
    freshnessAt: '2026-03-15T10:20:00.000Z',
    nowMs: Date.parse('2026-03-15T10:20:05.000Z')
  });

  assert.ok(model);
  assert.equal(model?.timers.length, 0);
  assert.equal(model?.flowLockSummary, 'Card window open');
  assert.equal(model?.banner?.title, 'Card resolution is blocking play');
});
