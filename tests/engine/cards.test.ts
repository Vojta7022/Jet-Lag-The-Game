import assert from 'node:assert/strict';
import test from 'node:test';

import { representativePointFromGeometry } from '../../packages/geo/src/index.ts';
import { buildMatchProjection, executeCommand } from '../../packages/engine/src/index.ts';
import {
  loadEngineTestContentPack,
  makeEnvelope,
  moveCardToTeamHand,
  setupMatchToHidePhase,
  setupMatchToSeekReady
} from './helpers.ts';

test('Move lets only the hider relocate, select a new zone, and confirm arrival', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = {
    requireStationCenteredZone: true,
    endgameRequiresOffTransit: true
  };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const oldStation = { latitude: point![1], longitude: point![0] };
  const newStation = { latitude: 50.2, longitude: 14.25 };

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/old', stationName: 'Old Station', ...oldStation } } as never,
    30), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: oldStation },
    31), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'end_hide_phase', payload: {} },
    32), contentPack).aggregate;
  const moveCardId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  const spareCardId = moveCardToTeamHand(aggregate, 'power-up-veto', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardId } },
    33), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'move');
  assert.equal(aggregate.activeCardResolution?.moveDurationSeconds, 10 * 60);
  assert.equal(aggregate.activeCardResolution?.moveOriginStationName, 'Old Station');
  assert.equal(aggregate.hiddenState.hiderLocation, undefined);
  assert.equal(aggregate.cardInstances[spareCardId]?.zone, 'discard_pile');
  const seekerMoveView = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(seekerMoveView.activeCardResolution?.moveOriginStationName, 'Old Station');
  assert.equal(seekerMoveView.hiddenState, undefined);

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: 50.21, longitude: 14.25, source: 'manual' } },
    34), contentPack), /only the hider can move during a Move card/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'update_location', payload: { ...newStation, source: 'manual' } },
    35), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/new', stationName: 'New Station', ...newStation } } as never,
    36), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: newStation },
    37), contentPack).aggregate;

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    632), contentPack), /Move timer has not expired/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    633), contentPack).aggregate;

  assert.equal(aggregate.hiddenState.hidingZone?.stationId, 'node/new');
  assert.equal(aggregate.hiddenState.hiderLocation?.latitude, newStation.latitude);
  assert.equal(aggregate.seekPhaseSubstate, 'ready');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_final_hiding_spot', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      publiclyAccessible: true,
      within3mOfMarkedPath: true
    } },
    634), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      source: 'manual',
      onTransit: false
    } },
    638), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_hider_found', payload: {
      latitude: newStation.latitude,
      longitude: newStation.longitude,
      visuallyIdentified: true
    } },
    643), contentPack).aggregate;
  assert.equal(aggregate.roundResults?.at(-1)?.survivalSeconds, 33);
});

test('Bridge Troll blocks the next question until each seeker confirms they are under a bridge', () => {
  const contentPack = loadEngineTestContentPack();
  const bridgeTroll = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-bridge-troll');
  assert.ok(bridgeTroll);
  bridgeTroll.castingCost = [];
  bridgeTroll.effects = bridgeTroll.effects.map((effect) => ({
    ...effect,
    effectType: 'bridge_troll_challenge',
    automationLevel: 'assisted'
  }));
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.players['seeker-2'] = {
    playerId: 'seeker-2', displayName: 'Second Seeker', connectionState: 'connected', joinedAt: aggregate.createdAt
  };
  aggregate.roleAssignments['seeker-2'] = { playerId: 'seeker-2', role: 'seeker', teamId: 'team-seeker' };
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, bridgeTroll.cardDefinitionId, 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'bridge_troll_challenge');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.bridgeTrollChallenge?.sourceCardInstanceId, cardInstanceId);
  assert.deepEqual(aggregate.bridgeTrollChallenge?.attestedAtByPlayerId, {});
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 72), contentPack), /does not have permission/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: 'yes' } } as never, 72), contentPack), /choose whether you are currently under the bridge/i);
  for (const role of ['hider', 'seeker'] as const) {
    const teamId = role === 'hider' ? 'team-hider' : 'team-seeker';
    const view = buildMatchProjection(aggregate, contentPack, {
      scope: 'team_private',
      viewerPlayerId: `${role}-1`,
      viewerTeamId: teamId,
      viewerRole: role
    });
    assert.equal(view.bridgeTrollChallenge?.sourceCardInstanceId, cardInstanceId);
  }

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'begin_question_prompt', payload: {} }, 72), contentPack).aggregate;
  const askQuestion = (occurredAt: number) => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'ask_question', payload: {
      questionInstanceId: 'question:bridge-troll',
      templateId: 'matching-commercial-airport',
      targetTeamId: 'team-hider'
    } }, occurredAt), contentPack);
  assert.throws(() => askQuestion(73), /every seeker must confirm they are under a bridge/i);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 74), contentPack).aggregate;
  assert.deepEqual(aggregate.bridgeTrollChallenge?.attestedAtByPlayerId, { 'seeker-1': '2026-01-01T00:01:14.000Z' });
  assert.throws(() => askQuestion(75), /every seeker must confirm they are under a bridge/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-2', playerId: 'seeker-2', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 76), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: false } } as never, 77), contentPack).aggregate;
  assert.throws(() => askQuestion(78), /every seeker must confirm they are under a bridge/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'set_bridge_troll_position', payload: { sourceCardInstanceId: cardInstanceId, underBridge: true } } as never, 79), contentPack).aggregate;
  const result = askQuestion(80);
  assert.equal(result.aggregate.questionInstances['question:bridge-troll']?.status, 'awaiting_answer');
  assert.equal(result.aggregate.bridgeTrollChallenge, undefined);
});

test('Urban Explorer blocks questions until every seeker confirms they are off transit and out of train stations', () => {
  const contentPack = loadEngineTestContentPack();
  const card = contentPack.cards.find((item) => item.cardDefinitionId === 'curse-curse-of-the-urban-explorer');
  assert.ok(card);
  card.castingCost = [];
  card.effects = card.effects.map((effect) => ({
    ...effect,
    effectType: 'seeker_off_transit_challenge',
    automationLevel: 'assisted'
  }));
  let aggregate = setupMatchToSeekReady(contentPack);
  aggregate.players['seeker-2'] = {
    playerId: 'seeker-2', displayName: 'Second Seeker', connectionState: 'connected', joinedAt: aggregate.createdAt
  };
  aggregate.roleAssignments['seeker-2'] = { playerId: 'seeker-2', role: 'seeker', teamId: 'team-seeker' };
  aggregate.teams['team-seeker']!.memberPlayerIds.push('seeker-2');
  const cardInstanceId = moveCardToTeamHand(aggregate, card.cardDefinitionId, 'team-hider');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId } }, 70), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'seeker_off_transit_challenge');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardInstanceId } }, 71), contentPack).aggregate;
  assert.equal(aggregate.seekerOffTransitRestriction?.sourceCardInstanceId, cardInstanceId);

  const askQuestion = (step: number) => {
    const prompted = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} }, step), contentPack).aggregate;
    return executeCommand(prompted, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'ask_question', payload: {
        questionInstanceId: `question:urban-explorer:${step}`,
        templateId: 'matching-commercial-airport',
        targetTeamId: 'team-hider'
      } }, step + 1), contentPack).aggregate;
  };

  assert.throws(() => askQuestion(72), /each seeker must confirm they are off transit and outside a train station/i);
  const setStatus = (playerId: string, onTransitOrAtStation: boolean, step: number) => executeCommand(aggregate,
    makeEnvelope(aggregate.matchId,
      { actorId: playerId, playerId, role: 'seeker' },
      { type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: cardInstanceId, onTransitOrAtStation } } as never,
      step), contentPack);
  aggregate = setStatus('seeker-1', false, 74).aggregate;
  assert.throws(() => askQuestion(75), /each seeker must confirm they are off transit and outside a train station/i);
  aggregate = setStatus('seeker-2', true, 77).aggregate;
  assert.throws(() => askQuestion(78), /seekers cannot ask while anyone is on transit or at a train station/i);
  aggregate = setStatus('seeker-2', false, 80).aggregate;

  const hiderProjection = buildMatchProjection(aggregate, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  assert.equal(hiderProjection.seekerOffTransitRestriction?.statusByPlayerId['seeker-1']?.onTransitOrAtStation, false);
  assert.equal(hiderProjection.seekerOffTransitRestriction?.statusByPlayerId['seeker-2']?.onTransitOrAtStation, false);
  assert.equal(askQuestion(82).lifecycleState, 'seek_phase');
});

test('Hidden Hangman tracks a private five-letter word and public seeker guesses until solved', () => {
  const contentPack = loadEngineTestContentPack();
  const hangmanDefinition = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-hidden-hangman');
  assert.ok(hangmanDefinition);
  hangmanDefinition.castingCost = [];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-hidden-hangman', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: cardId } }, 70), contentPack).aggregate;

  assert.equal(aggregate.activeCardResolution?.resolutionKind, 'hangman_challenge');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 71), contentPack), /set the five-letter word/i);

  const setWord = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hangman_word', payload: { sourceCardInstanceId: cardId, word: 'train' } } as never, 72), contentPack);
  assert.equal(setWord.events[0]?.visibilityScope, 'player_private');
  aggregate = setWord.aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 73), contentPack), /finish the Hangman challenge/i);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: 50.1, longitude: 14.1, source: 'manual' } }, 74), contentPack), /location updates are only allowed in active movement states/i);
  const hiderView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  const seekerView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(hiderView.activeCardResolution?.hangman?.secretWord, 'TRAIN');
  assert.equal(seekerView.activeCardResolution?.hangman?.secretWord, undefined);
  assert.equal(seekerView.activeCardResolution?.hangman?.maskedWord, '_____');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'z' } } as never, 73), contentPack).aggregate;
  const seekerAfterMiss = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.deepEqual(seekerAfterMiss.activeCardResolution?.hangman?.incorrectLetters, ['Z']);
  assert.equal(seekerAfterMiss.activeCardResolution?.hangman?.maskedWord, '_____');

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'r' } } as never, 74), contentPack).aggregate;
  assert.deepEqual(aggregate.activeCardResolution?.hangman?.guessedLetters, ['Z', 'R']);
  assert.equal(buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  }).activeCardResolution?.hangman?.maskedWord, '_R___');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter: 'R' } } as never, 75), contentPack), /already been guessed/i);

  for (const [step, letter] of ['t', 'a', 'i', 'n'].entries()) {
    aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'guess_hangman_letter', payload: { sourceCardInstanceId: cardId, letter } } as never, 76 + step), contentPack).aggregate;
  }
  assert.equal(aggregate.activeCardResolution?.hangman?.status, 'solved');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 80), contentPack).aggregate;
  assert.equal(aggregate.activeCardResolution, undefined);
});

test('Hidden Hangman hider ends the group-played challenge and reveals its word to seekers', () => {
  const contentPack = loadEngineTestContentPack();
  const hangmanDefinition = contentPack.cards.find((card) => card.cardDefinitionId === 'curse-curse-of-the-hidden-hangman');
  assert.ok(hangmanDefinition);
  hangmanDefinition.castingCost = [];
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-hidden-hangman', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: cardId } }, 90), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hangman_word', payload: { sourceCardInstanceId: cardId, word: 'train' } } as never, 91), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'end_hangman_challenge', payload: { sourceCardInstanceId: cardId } } as never, 92), contentPack), /does not have permission/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'end_hangman_challenge', payload: { sourceCardInstanceId: cardId } } as never, 93), contentPack).aggregate;

  const seekerView = buildMatchProjection(aggregate, contentPack, {
    scope: 'player_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  assert.equal(seekerView.activeCardResolution?.hangman?.status, 'ended');
  assert.equal(seekerView.activeCardResolution?.hangman?.revealedWord, 'TRAIN');
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: cardId } }, 94), contentPack), /does not have permission/i);
});

test('Move pauses and resumes the hide-phase timer without consuming its remaining time', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const oldStation = { latitude: point![1], longitude: point![0] };
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/old', stationName: 'Old Station', ...oldStation } } as never,
    20), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: oldStation },
    21), contentPack).aggregate;
  const moveCardId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardId } },
    30), contentPack).aggregate;
  const pausedTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.equal(pausedTimer?.status, 'paused');
  assert.equal(pausedTimer?.remainingSeconds, 100);

  const newStation = { latitude: 50.2, longitude: 14.25 };
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'update_location', payload: { ...newStation, source: 'manual' } },
    50), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/new', stationName: 'New Station', ...newStation } } as never,
    51), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: newStation },
    52), contentPack).aggregate;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'end_hide_phase', payload: {} },
    55), contentPack), /Move card must finish/i);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'resolve_card_window', payload: { sourceCardInstanceId: moveCardId } },
    630), contentPack).aggregate;

  const resumedTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.equal(resumedTimer?.status, 'running');
  assert.equal(resumedTimer?.remainingSeconds, 100);
  assert.equal(resumedTimer?.startedAt, new Date(Date.UTC(2026, 0, 1, 0, 10, 10)).toISOString());
});

test('discard_card moves an accessible hand card into the discard pile', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const cardInstanceId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-zoologist', 'team-hider');

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

test('Move requires an original station to reveal before it starts', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToSeekReady(contentPack);
  const moveCardInstanceId = moveCardToTeamHand(aggregate, 'power-up-move', 'team-hider');

  assert.throws(() => executeCommand(aggregate, makeEnvelope(
    aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'play_card', payload: { cardInstanceId: moveCardInstanceId } },
    39
  ), contentPack), /original hiding station/i);
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
  const cardInstanceId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-zoologist', 'team-hider');

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
  const originalCardId = moveCardToTeamHand(aggregate, 'curse-curse-of-the-zoologist', 'team-hider');

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
