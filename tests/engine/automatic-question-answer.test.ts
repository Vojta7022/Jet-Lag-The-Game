import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  recordLocationUpdate,
  setupMatchToSeekReady
} from './helpers.ts';

function setupRadarMatch() {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'hider-1', role: 'hider', latitude: 1.1, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 13
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 14
  });
  return { aggregate, contentPack };
}

test('Radar automatically answers from fresh hider and seeker fixes and applies the bounded map deduction', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 15), contentPack).aggregate;

  const result = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:auto-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 16), contentPack);
  const resolved = result.aggregate;

  assert.equal(resolved.questionInstances['question:auto-radar']?.status, 'resolved');
  assert.equal(resolved.questionInstances['question:auto-radar']?.answer?.value, 'yes');
  assert.equal(Object.values(resolved.constraints).some((constraint) => constraint.sourceQuestionInstanceId === 'question:auto-radar'), true);
  assert.equal(resolved.searchArea?.history.at(-1)?.summary.includes('Radar'), true);

  const hiderView = buildMatchProjection(resolved, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerRole: 'hider', viewerTeamId: 'team-hider'
  });
  const seekerView = buildMatchProjection(resolved, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerRole: 'seeker', viewerTeamId: 'team-seeker'
  });
  assert.equal(hiderView.visibleQuestions.find((question) => question.questionInstanceId === 'question:auto-radar')?.answer?.value, 'yes');
  assert.equal(hiderView.visibleMovementTracks.some((track) => track.playerId === 'seeker-1'), true);
  assert.equal(seekerView.visibleMovementTracks.some((track) => track.playerId === 'hider-1'), false);
  assert.equal(seekerView.pendingQuestionReward, undefined);
  const answerEvent = result.events.find((event) => event.event.type === 'question_answered');
  assert.ok(answerEvent && answerEvent.event.type === 'question_answered');
  assert.equal('latitude' in answerEvent.event.payload, false);
  assert.equal('longitude' in answerEvent.event.payload, false);
});

test('Radar refuses to guess when either location fix is stale or too imprecise', () => {
  const { aggregate, contentPack } = setupRadarMatch();
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 60), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:stale-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 61), contentPack), /fresh and accurate location fix/i);
});

test('Radar refuses a location fix whose reported accuracy exceeds the configured bound', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.101, longitude: 103.8,
    accuracyMeters: 120, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:imprecise-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack), /fresh and accurate location fix/i);
});

test('Radar returns no and applies the outside-radius constraint when the hider is beyond the threshold', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.11, longitude: 103.8,
    accuracyMeters: 5, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;
  const resolved = executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:outside-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack).aggregate;

  assert.equal(resolved.questionInstances['question:outside-radar']?.answer?.value, 'no');
  assert.equal(Object.values(resolved.constraints).some((constraint) => constraint.constraintId === 'outside-radius'), true);
});

test('Radar asks for refreshed fixes when GPS uncertainty overlaps the question threshold', () => {
  const { aggregate: initial, contentPack } = setupRadarMatch();
  const aggregate = recordLocationUpdate(initial, contentPack, {
    playerId: 'seeker-1', role: 'seeker', latitude: 1.1036, longitude: 103.8,
    accuracyMeters: 30, source: 'device', step: 15
  });
  const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 16), contentPack).aggregate;

  assert.throws(() => executeCommand(prompted, makeEnvelope(prompted.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' }, {
      type: 'ask_question',
      payload: { questionInstanceId: 'question:ambiguous-radar', templateId: 'radar-402', targetTeamId: 'team-hider' }
    }, 17), contentPack), /overlaps the Radar boundary/i);
});
