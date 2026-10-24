import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  setupMatchToSeekReady
} from './helpers.ts';

test('discard_card moves an accessible hand card into the discard pile', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'discard_card',
        payload: {
          cardInstanceId
        }
      },
      40
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[cardInstanceId]?.holderType, 'team');
  assert.equal(aggregate.cardInstances[cardInstanceId]?.holderId, 'team-hider');
});

test('Move cannot be played after the endgame has started', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const moveCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  aggregate.lifecycleState = 'endgame';
  aggregate.seekPhaseSubstate = 'ready';

  assert.throws(() => executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      { type: 'play_card', payload: { cardInstanceId: moveCardInstanceId } },
      39
    ),
    contentPack
  ), /cannot be played during the endgame/i);
});

test('player_private projections can still see the viewer team shared hand without leaking other teams', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const hiderCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  const seekerCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-seeker');

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private',
    viewerPlayerId: 'seeker-1',
    viewerTeamId: 'team-seeker',
    viewerRole: 'seeker'
  });

  assert.equal(
    hiderProjection.visibleCards.some((card) => card.cardInstanceId === hiderCardInstanceId),
    true
  );
  assert.equal(
    hiderProjection.visibleCards.some((card) => card.cardInstanceId === seekerCardInstanceId),
    false
  );
  assert.equal(
    seekerProjection.visibleCards.some((card) => card.cardInstanceId === seekerCardInstanceId),
    true
  );
  assert.equal(
    seekerProjection.visibleCards.some((card) => card.cardInstanceId === hiderCardInstanceId),
    false
  );
});

test('resolved manual cards stay visible in the discard pile for the owning team after the card window closes', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'play_card',
        payload: {
          cardInstanceId
        }
      },
      50
    ),
    contentPack
  ).aggregate;

  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_card_resolution');

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'resolve_card_window',
        payload: {
          sourceCardInstanceId: cardInstanceId
        }
      },
      51
    ),
    contentPack
  ).aggregate;

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private',
    viewerPlayerId: 'hider-1',
    viewerTeamId: 'team-hider',
    viewerRole: 'hider'
  });

  assert.equal(aggregate.cardInstances[cardInstanceId]?.zone, 'discard_pile');
  assert.equal(
    hiderProjection.visibleCards.some(
      (card) => card.cardInstanceId === cardInstanceId && card.zone === 'discard_pile'
    ),
    true
  );
});

test('Draw 1 Expand 1 draws a card and permanently raises the hider hand limit for this round', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const sourceCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  const drawPileBefore = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length;
  aggregate = executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'play_card', payload: { cardInstanceId: sourceCardInstanceId }
    }, 80),
    contentPack
  ).aggregate;

  assert.equal(aggregate.activeCardResolution, undefined);

  const hiderHand = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  );
  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });

  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(hiderProjection.hiderHandLimit, 7);
  assert.equal(seekerProjection.hiderHandLimit, undefined);
  assert.equal(hiderHand.length, 1);
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length, drawPileBefore - 1);
  assert.equal(aggregate.cardInstances[sourceCardInstanceId]?.zone, 'discard_pile');

  for (let index = 0; index < 6; index += 1) {
    aggregate = executeCommand(
      aggregate,
      makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
        type: 'draw_card', payload: { deckId: 'hider-main' }
      }, 81 + index),
      contentPack
    ).aggregate;
  }
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  ).length, 7);
  assert.throws(() => executeCommand(
    aggregate,
    makeEnvelope(aggregate.matchId, { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' }, {
      type: 'draw_card', payload: { deckId: 'hider-main' }
    }, 89),
    contentPack
  ), /target size of 7/);
});

test('Draw 1 Expand 1 can be played during a live answer window without interrupting it', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const sourceCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 91), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:live-for-card', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 92), contentPack).aggregate;

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: sourceCardInstanceId } }, 93), contentPack).aggregate;

  assert.equal(aggregate.activeQuestionInstanceId, 'question:live-for-card');
  assert.equal(aggregate.seekPhaseSubstate, 'awaiting_question_answer');
  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(aggregate.cardInstances[sourceCardInstanceId]?.zone, 'discard_pile');
});

test('Duplicate copies a held power-up effect and leaves the original card in hand', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const duplicateCardId = moveCardToTeamHand(aggregate, 'power-up-duplicate', 'team-hider');
  const originalCardId = moveCardToTeamHand(aggregate, 'power-up-draw-1-expand-1', 'team-hider');
  const drawPileBefore = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length;

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: duplicateCardId } }, 79), contentPack), /choose a card in your hand to copy/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    {
      type: 'play_card',
      payload: { cardInstanceId: duplicateCardId, duplicateTargetCardInstanceId: originalCardId }
    }, 80), contentPack).aggregate;

  const hiderHand = Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'team' && card.holderId === 'team-hider' && card.zone === 'hand'
  );
  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
  assert.equal(hiderHand.length, 2);
  assert.equal(aggregate.hiderHandLimitBonus, 1);
  assert.equal(Object.values(aggregate.cardInstances).filter(
    (card) => card.holderType === 'deck' && card.holderId === 'hider-main' && card.zone === 'draw_pile'
  ).length, drawPileBefore - 1);
});

test('Duplicate identifies a copied manual effect in its private resolution window', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const duplicateCardId = moveCardToTeamHand(aggregate, 'power-up-duplicate', 'team-hider');
  const originalCardId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    {
      type: 'play_card',
      payload: { cardInstanceId: duplicateCardId, duplicateTargetCardInstanceId: originalCardId }
    }, 81), contentPack).aggregate;

  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'pending_resolution');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
  assert.equal(aggregate.activeCardResolution?.copiedCardInstanceId, originalCardId);
  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(hiderProjection.activeCardResolution?.copiedCardInstanceId, originalCardId);
  assert.equal(seekerProjection.activeCardResolution?.copiedCardInstanceId, undefined);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: duplicateCardId } }, 82), contentPack).aggregate;
  assert.equal(aggregate.cardInstances[duplicateCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.cardInstances[originalCardId]?.zone, 'hand');
});

test('Veto ends the active question without an answer or card reward and counts as asked', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const vetoCardId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 101), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:vetoed', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 102), contentPack).aggregate;

  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: vetoCardId } }, 103), contentPack);
  aggregate = result.aggregate;

  assert.equal(aggregate.questionInstances['question:vetoed']?.status, 'vetoed');
  assert.equal(aggregate.questionInstances['question:vetoed']?.answer, undefined);
  assert.equal(aggregate.activeQuestionInstanceId, undefined);
  assert.equal(aggregate.seekPhaseSubstate, 'ready');
  assert.equal(aggregate.cardInstances[vetoCardId]?.zone, 'discard_pile');
  assert.equal(aggregate.pendingQuestionReward, undefined);
  assert.equal(result.events.some((event) => event.event.type === 'question_vetoed'), true);
});

test('Randomize cancels the active question and asks a different available question from the same category', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const randomizeCardId = moveCardToTeamHand(aggregate, 'power-up-randomize', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 111), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:rerolled', templateId: 'matching-commercial-airport', targetTeamId: 'team-hider'
    } }, 112), contentPack).aggregate;

  const originalRandom = Math.random;
  Math.random = () => 0;
  let result;
  try {
    result = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      { type: 'play_card', payload: { cardInstanceId: randomizeCardId } }, 113), contentPack);
  } finally {
    Math.random = originalRandom;
  }
  aggregate = result!.aggregate;

  const replacement = aggregate.activeQuestionInstanceId
    ? aggregate.questionInstances[aggregate.activeQuestionInstanceId]
    : undefined;
  assert.equal(aggregate.questionInstances['question:rerolled']?.status, 'canceled');
  assert.ok(replacement);
  assert.equal(replacement.categoryId, 'matching');
  assert.notEqual(replacement.templateId, 'matching-commercial-airport');
  assert.equal(replacement.status, 'awaiting_answer');
  assert.equal(aggregate.cardInstances[randomizeCardId]?.zone, 'discard_pile');
  assert.equal(result!.events.some((event) => event.event.type === 'question_randomized'), true);

  const nullAnswer = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'answer_question', payload: {
      questionInstanceId: replacement.questionInstanceId,
      answer: { value: null }
    } }, 114), contentPack);
  aggregate = nullAnswer.aggregate;
  assert.equal(aggregate.questionInstances[replacement.questionInstanceId]?.status, 'resolved');
  assert.equal(aggregate.activeQuestionInstanceId, undefined);
  assert.equal(aggregate.constraints[`${replacement.questionInstanceId}:null-answer`], undefined);
});
