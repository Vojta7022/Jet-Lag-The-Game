import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import { reconcileRuntimeState } from '../../packages/transport/src/reconcile-runtime-state.ts';
import { loadEngineTestContentPack, makeEnvelope, setupMatchToSeekReady } from './helpers.ts';

function setupMatchToEndgame() {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.questionPolicies = { cooldownSeconds: 10 };
  contentPack.rulesets[0]!.locationPolicies = { endgameRequiresOffTransit: true };
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.hiddenState = {
    hidingZone: {
      stationId: 'node/endgame-test',
      stationName: 'Endgame Station',
      latitude: 1.1,
      longitude: 103.8,
      radiusMeters: 500,
      selectedAt: '2026-01-01T00:00:12.000Z',
      selectedByPlayerId: 'hider-1'
    },
    finalHidingSpot: {
      latitude: 1.1001,
      longitude: 103.8,
      publiclyAccessible: true,
      within3mOfMarkedPath: true,
      selectedAt: '2026-01-01T00:00:13.000Z',
      selectedByPlayerId: 'hider-1'
    }
  };
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: { latitude: 1.1, longitude: 103.8, source: 'manual', onTransit: false }
  } as never, 14), contentPack).aggregate;
  assert.equal(aggregate.lifecycleState, 'endgame');
  return { aggregate, contentPack };
}

test('endgame permits a full question cycle and stays in endgame after map resolution', () => {
  const { aggregate: initial, contentPack } = setupMatchToEndgame();
  let aggregate = initial;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, { type: 'begin_question_prompt', payload: {} }, 20), contentPack).aggregate;
  assert.equal(aggregate.lifecycleState, 'endgame');
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_selection');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'ask_question',
    payload: {
      questionInstanceId: 'question:endgame-cycle',
      templateId: 'matching-commercial-airport',
      targetTeamId: 'team-hider'
    }
  }, 21), contentPack).aggregate;
  assert.equal(aggregate.lifecycleState, 'endgame');
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_answer');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'answer_question',
    payload: { questionInstanceId: 'question:endgame-cycle', answer: { value: 'yes' } }
  }, 22), contentPack).aggregate;
  assert.equal(aggregate.lifecycleState, 'endgame');
  assert.equal(aggregate.seekPhaseSubstate, 'applying_constraints');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, {
    type: 'apply_constraint',
    payload: {
      questionInstanceId: 'question:endgame-cycle',
      constraintId: 'nearest-feature-match',
      metadata: { answer: 'yes' }
    }
  }, 23), contentPack).aggregate;
  assert.equal(aggregate.lifecycleState, 'endgame');
  assert.equal(aggregate.seekPhaseSubstate, 'cooldown');
  assert.equal(aggregate.hiddenState.endgame?.finalHidingSpot.latitude, 1.1001);
  assert.equal(aggregate.questionInstances['question:endgame-cycle']?.status, 'resolved');
  const cooldown = Object.values(aggregate.timers).find((timer) => timer.kind === 'cooldown');
  assert.ok(cooldown);
  const afterCooldown = reconcileRuntimeState({
    aggregate,
    contentPack,
    occurredAt: new Date(Date.parse(cooldown!.startedAt) + cooldown!.durationSeconds * 1000 + 1).toISOString()
  }).aggregate;
  assert.equal(afterCooldown.lifecycleState, 'endgame');
  assert.equal(afterCooldown.seekPhaseSubstate, 'ready');
});

test('late question answers pause scored hiding time and do not earn a card reward', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.questionPolicies = { cooldownSeconds: 0 };
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, { type: 'begin_question_prompt', payload: {} }, 401), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'ask_question',
    payload: { questionInstanceId: 'question:late-answer', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' }
  }, 402), contentPack).aggregate;
  const responseTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'question');
  const hideTimerBefore = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.ok(responseTimer);
  assert.ok(hideTimerBefore);

  const lateAt = new Date(Date.parse(responseTimer.startedAt) + responseTimer.durationSeconds * 1000 + 1).toISOString();
  const late = reconcileRuntimeState({ aggregate, contentPack, occurredAt: lateAt }).aggregate;
  assert.equal(late.questionInstances['question:late-answer']?.lateResponseStartedAt,
    new Date(Date.parse(responseTimer.startedAt) + responseTimer.durationSeconds * 1000).toISOString());
  assert.equal(late.timers[hideTimerBefore.timerId]?.status, hideTimerBefore.status);

  const answered = executeCommand(late, makeEnvelope(late.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'answer_question',
    payload: { questionInstanceId: 'question:late-answer', answer: { value: 'yes' } }
  }, 703), contentPack).aggregate;
  assert.equal(answered.timers[hideTimerBefore.timerId]?.status, hideTimerBefore.status);
  assert.equal(answered.questionInstances['question:late-answer']?.lateResponseEndedAt,
    new Date(Date.UTC(2026, 0, 1, 0, 11, 43)).toISOString());
  const resolved = executeCommand(answered, makeEnvelope(answered.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, {
    type: 'apply_constraint',
    payload: { questionInstanceId: 'question:late-answer', constraintId: 'nearest-feature-match', metadata: { answer: 'yes' } }
  }, 704), contentPack).aggregate;
  assert.throws(() => executeCommand(answered, makeEnvelope(answered.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'deal_question_reward',
    payload: { questionInstanceId: 'question:late-answer' }
  }, 705), contentPack), /handled after the question and map resolution/);
  assert.throws(() => executeCommand(resolved, makeEnvelope(resolved.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'deal_question_reward',
    payload: { questionInstanceId: 'question:late-answer' }
  }, 706), contentPack), /Late answers/);
  resolved.lifecycleState = 'endgame';
  resolved.hiddenState.endgame = {
    startedAt: new Date(Date.UTC(2026, 0, 1, 0, 11, 44)).toISOString(),
    triggeredByPlayerId: 'seeker-1',
    finalHidingSpot: {
      latitude: 50.1,
      longitude: 14.1,
      publiclyAccessible: true,
      within3mOfMarkedPath: true,
      selectedAt: new Date(Date.UTC(2026, 0, 1, 0, 11, 44)).toISOString(),
      selectedByPlayerId: 'hider-1'
    }
  };
  const found = executeCommand(resolved, makeEnvelope(resolved.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'confirm_hider_found',
    payload: { latitude: 50.1, longitude: 14.1, visuallyIdentified: true }
  }, 706), contentPack).aggregate;
  assert.equal(found.roundResults?.at(-1)?.survivalSeconds, 695);
});

test('an impossible endgame photo is a valid answer and the hider can still draw its reward', () => {
  const { aggregate: initial, contentPack } = setupMatchToEndgame();
  contentPack.rulesets[0]!.questionPolicies = { cooldownSeconds: 0 };
  let aggregate = initial;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, { type: 'begin_question_prompt', payload: {} }, 30), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'ask_question',
    payload: { questionInstanceId: 'question:endgame-photo', templateId: 'photos-a-tree', targetTeamId: 'team-hider' }
  }, 31), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'answer_question',
    payload: { questionInstanceId: 'question:endgame-photo', answer: { note: 'No photo attached.' } }
  }, 32), contentPack), /attachment/);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'answer_question',
    payload: {
      questionInstanceId: 'question:endgame-photo',
      answer: { cannotAnswerDueToEndgame: true, note: 'The fixed spot makes this photo impossible.' }
    }
  }, 33), contentPack).aggregate;
  assert.equal(aggregate.questionInstances['question:endgame-photo']?.answer?.cannotAnswerDueToEndgame, true);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, {
    type: 'apply_constraint',
    payload: { questionInstanceId: 'question:endgame-photo', constraintId: 'photo-evidence', metadata: {} }
  }, 34), contentPack).aggregate;
  const cardsBefore = Object.values(aggregate.cardInstances).filter(
    (card) => card.zone === 'hand' && card.holderType === 'team' && card.holderId === 'team-hider'
  ).length;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, { type: 'deal_question_reward', payload: { questionInstanceId: 'question:endgame-photo' } }, 35), contentPack).aggregate;
  const reward = aggregate.pendingQuestionReward!;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'choose_question_reward',
    payload: {
      questionInstanceId: 'question:endgame-photo',
      selectedCardInstanceIdsBySet: reward.sets.map((set) => [set.cardInstanceIds[0]!])
    }
  }, 35.1), contentPack).aggregate;
  const cardsAfter = Object.values(aggregate.cardInstances).filter(
    (card) => card.zone === 'hand' && card.holderType === 'team' && card.holderId === 'team-hider'
  ).length;
  assert.equal(aggregate.lifecycleState, 'endgame');
  assert.equal(cardsAfter, cardsBefore + 1);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, { type: 'begin_question_prompt', payload: {} }, 36), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'ask_question',
    payload: { questionInstanceId: 'question:endgame-matching', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider' }
  }, 37), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'answer_question',
    payload: {
      questionInstanceId: 'question:endgame-matching',
      answer: { cannotAnswerDueToEndgame: true }
    }
  }, 38), contentPack), /only valid for a photo challenge/);
});
