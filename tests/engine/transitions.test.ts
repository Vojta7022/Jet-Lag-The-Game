import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToSeekReady } from './helpers.ts';

test('core state machine transitions flow from hide phase into question cooldown and back to ready', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);

  assert.equal(aggregate.lifecycleState, 'seek_phase');
  assert.equal(aggregate.seekPhaseSubstate, 'ready');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      13
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_selection');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question-1',
          templateId: 'matching-commercial-airport',
          targetTeamId: 'team-hider'
        }
      },
      14
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_answer');
  assert.equal(aggregate.activeQuestionInstanceId, 'question-1');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'answer_question',
        payload: {
          questionInstanceId: 'question-1',
          answer: {
            value: 'yes'
          }
        }
      },
      15
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'applying_constraints');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'apply_constraint',
        payload: {
          questionInstanceId: 'question-1',
          constraintId: 'nearest-feature-match',
          metadata: {
            answer: 'yes'
          }
        }
      },
      16
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'cooldown');
  assert.equal(aggregate.activeQuestionInstanceId, undefined);
  assert.ok(Object.values(aggregate.constraints).some((constraint) => constraint.constraintId === 'nearest-feature-match'));

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      { type: 'complete_cooldown', payload: {} },
      17
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'ready');
});
