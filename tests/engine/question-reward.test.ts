import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import {
  buildMatchProjection,
  type DomainCommand
} from '../../packages/engine/src/index.ts';
import {
  getCurrentQuestionTemplate,
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  openAnsweredQuestion,
  setupMatchToSeekReady
} from './helpers.ts';

function setupResolvedRadarQuestion() {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const template = getCurrentQuestionTemplate(aggregate, contentPack, 'radar', 'radar-402');
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question:reward-radar',
    templateId: template.templateId,
    answer: { value: 'yes' },
    startStep: 70
  });
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'apply_constraint',
      payload: {
        questionInstanceId: 'question:reward-radar',
        constraintId: 'within-radius',
        metadata: {
          answer: 'yes',
          spatial: {
            mode: 'metadata_only',
            regionId: aggregate.mapRegion!.regionId,
            precision: 'metadata_only',
            featureCoverage: 'metadata_only',
            explanation: 'Question reward fixture.'
          }
        }
      }
    },
    80
  ), contentPack).aggregate;
  return { aggregate, contentPack };
}

test('a resolved Investigation Book question deals its printed draw count into a private pick pool', () => {
  const { aggregate, contentPack } = setupResolvedRadarQuestion();
  const dealt = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:reward-radar' } } as DomainCommand,
    81
  ), contentPack);

  assert.equal(dealt.aggregate.pendingQuestionReward?.sets.length, 1);
  assert.equal(dealt.aggregate.pendingQuestionReward?.sets[0]?.cardInstanceIds.length, 2);
  assert.equal(dealt.aggregate.pendingQuestionReward?.sets[0]?.pickCount, 1);
  assert.equal(Object.values(dealt.aggregate.cardInstances).filter((card) => card.zone === 'reward_selection').length, 2);
  assert.equal(Object.values(dealt.aggregate.cardInstances).filter((card) => card.zone === 'hand' && card.holderId === 'team-hider').length, 0);

  const seekerProjection = buildMatchProjection(dealt.aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerRole: 'seeker', viewerTeamId: 'team-seeker'
  });
  const hiderProjection = buildMatchProjection(dealt.aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerRole: 'hider', viewerTeamId: 'team-hider'
  });
  assert.equal(seekerProjection.visibleCards.some((card) => card.zone === 'reward_selection'), false);
  assert.equal(hiderProjection.visibleCards.filter((card) => card.zone === 'reward_selection').length, 2);
});

test('the hider keeps the selected reward cards and discards the rest of the dealt set', () => {
  const { aggregate, contentPack } = setupResolvedRadarQuestion();
  const deal = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:reward-radar' } } as DomainCommand,
    81
  ), contentPack);
  const chosenId = deal.aggregate.pendingQuestionReward!.sets[0]!.cardInstanceIds[0]!;
  const chosen = executeCommand(deal.aggregate, makeEnvelope(
    deal.aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'choose_question_reward', payload: { questionInstanceId: 'question:reward-radar', selectedCardInstanceIdsBySet: [[chosenId]] } } as DomainCommand,
    82
  ), contentPack);

  assert.equal(chosen.aggregate.pendingQuestionReward, undefined);
  assert.equal(chosen.aggregate.cardInstances[chosenId]?.zone, 'hand');
  assert.equal(Object.values(chosen.aggregate.cardInstances).filter((card) => card.zone === 'reward_selection').length, 0);
  assert.equal(Object.values(chosen.aggregate.cardInstances).filter((card) => card.zone === 'discard_pile').length, 1);
  assert.equal(Object.values(chosen.aggregate.cardInstances).filter((card) => card.zone === 'hand' && card.holderId === 'team-hider').length, 1);
});

test('Overflowing Chalice gives the hider an optional extra draw on each of the next three question rewards', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const chaliceCardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-overflowing-chalice', 'team-hider');
  const costCardId = moveCardToTeamHand(aggregate, 'power-up-randomize', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: chaliceCardId } },
    70
  ), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'extra_question_reward_draws');
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'discard_card', payload: { cardInstanceId: costCardId } },
    70.5
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: chaliceCardId } },
    71
  ), contentPack).aggregate;
  assert.deepEqual(aggregate.questionRewardDrawBonus, { opportunitiesRemaining: 3, extraDrawCount: 1 });
  const hiderBonusView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerRole: 'hider', viewerTeamId: 'team-hider'
  });
  const seekerBonusView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerRole: 'seeker', viewerTeamId: 'team-seeker'
  });
  assert.deepEqual(hiderBonusView.questionRewardDrawBonus, { opportunitiesRemaining: 3, extraDrawCount: 1 });
  assert.equal(seekerBonusView.questionRewardDrawBonus, undefined);

  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question:chalice-reward',
    templateId: 'radar-402',
    answer: { value: 'yes' },
    startStep: 80
  });
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    {
      type: 'apply_constraint',
      payload: {
        questionInstanceId: 'question:chalice-reward',
        constraintId: 'within-radius',
        metadata: { answer: 'yes', spatial: { mode: 'metadata_only', regionId: aggregate.mapRegion!.regionId, precision: 'metadata_only', featureCoverage: 'metadata_only', explanation: 'Chalice reward fixture.' } }
      }
    },
    90
  ), contentPack).aggregate;
  const dealt = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:chalice-reward', useQuestionRewardDrawBonus: true } },
    91
  ), contentPack);

  assert.equal(dealt.aggregate.pendingQuestionReward?.sets[0]?.cardInstanceIds.length, 3);
  assert.equal(dealt.aggregate.pendingQuestionReward?.sets[0]?.pickCount, 1);
  assert.deepEqual(dealt.aggregate.questionRewardDrawBonus, { opportunitiesRemaining: 2, extraDrawCount: 1 });

  const firstCard = dealt.aggregate.pendingQuestionReward!.sets[0]!.cardInstanceIds[0]!;
  aggregate = executeCommand(dealt.aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'choose_question_reward', payload: { questionInstanceId: 'question:chalice-reward', selectedCardInstanceIdsBySet: [[firstCard]] } },
    92
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'complete_cooldown', payload: {} },
    140
  ), contentPack).aggregate;

  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question:chalice-repeat-two',
    templateId: 'radar-402',
    answer: { value: 'yes' },
    startStep: 150
  });
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'apply_constraint', payload: {
      questionInstanceId: 'question:chalice-repeat-two',
      constraintId: 'within-radius',
      metadata: { answer: 'yes', spatial: { mode: 'metadata_only', regionId: aggregate.mapRegion!.regionId, precision: 'metadata_only', featureCoverage: 'metadata_only', explanation: 'Repeated Chalice reward fixture.' } }
    } },
    160
  ), contentPack).aggregate;
  const declined = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:chalice-repeat-two' } },
    161
  ), contentPack).aggregate;
  assert.deepEqual(declined.pendingQuestionReward?.sets.map((set) => set.cardInstanceIds.length), [2, 2]);
  assert.deepEqual(declined.questionRewardDrawBonus, { opportunitiesRemaining: 1, extraDrawCount: 1 });
  const secondRewardChoices = declined.pendingQuestionReward!.sets.map((set) => [set.cardInstanceIds[0]!]);
  aggregate = executeCommand(declined, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'choose_question_reward', payload: { questionInstanceId: 'question:chalice-repeat-two', selectedCardInstanceIdsBySet: secondRewardChoices } },
    162
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'complete_cooldown', payload: {} },
    210
  ), contentPack).aggregate;

  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question:chalice-repeat-three',
    templateId: 'radar-402',
    answer: { value: 'yes' },
    startStep: 220
  });
  aggregate = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'apply_constraint', payload: {
      questionInstanceId: 'question:chalice-repeat-three',
      constraintId: 'within-radius',
      metadata: { answer: 'yes', spatial: { mode: 'metadata_only', regionId: aggregate.mapRegion!.regionId, precision: 'metadata_only', featureCoverage: 'metadata_only', explanation: 'Third Chalice reward fixture.' } }
    } },
    230
  ), contentPack).aggregate;
  const thirdReward = executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:chalice-repeat-three' } },
    231
  ), contentPack).aggregate;
  assert.deepEqual(thirdReward.pendingQuestionReward?.sets.map((set) => set.cardInstanceIds.length), [2, 2, 2]);
  assert.equal(thirdReward.questionRewardDrawBonus, undefined);
});

test('the hider cannot request an Overflowing Chalice draw without an active bonus', () => {
  const { aggregate, contentPack } = setupResolvedRadarQuestion();
  assert.throws(() => executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'deal_question_reward', payload: { questionInstanceId: 'question:reward-radar', useQuestionRewardDrawBonus: true } },
    81
  ), contentPack), /no extra question reward draw available/i);
});
