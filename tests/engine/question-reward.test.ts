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
