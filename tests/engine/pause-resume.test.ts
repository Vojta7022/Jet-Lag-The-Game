import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToHidePhase, setupMatchToSeekReady } from './helpers.ts';

test('pause and resume preserve the interrupted state and pause timers', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToHidePhase(contentPack);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'pause_match',
        payload: {
          reason: 'Need a break'
        }
      },
      30
    ),
    contentPack
  ).aggregate;

  assert.ok(aggregate.paused);
  assert.equal(aggregate.paused?.resumeLifecycleState, 'hide_phase');
  assert.equal(aggregate.timers['hide-phase']?.status, 'paused');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      { type: 'resume_match', payload: {} },
      31
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.paused, undefined);
  assert.equal(aggregate.lifecycleState, 'hide_phase');
  assert.equal(aggregate.timers['hide-phase']?.status, 'running');

  aggregate = setupMatchToSeekReady(contentPack);
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      32
    ),
    contentPack
  ).aggregate;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question-pause',
          templateId: 'matching-commercial-airport',
          targetTeamId: 'team-hider'
        }
      },
      33
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'pause_match',
        payload: {
          reason: 'Pause mid question'
        }
      },
      34
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.paused?.resumeSeekPhaseSubstate, 'awaiting_question_answer');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      { type: 'resume_match', payload: {} },
      35
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.lifecycleState, 'seek_phase');
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_answer');
});
