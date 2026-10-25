import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import { representativePointFromGeometry } from '../../packages/geo/src/index.ts';
import { loadEngineTestContentPack, makeEnvelope, moveCardToTeamHand, setupMatchToHidePhase } from './helpers.ts';

test('match start randomly chooses the first hider and shuffles the full rotation and deck', () => {
  const aggregate = setupMatchToHidePhase(loadEngineTestContentPack(), 'small', 0);

  assert.deepEqual(aggregate.hiderRotationOrder, ['seeker-1', 'hider-1']);
  assert.equal(aggregate.roleAssignments['seeker-1']?.role, 'hider');
  assert.equal(aggregate.roleAssignments['hider-1']?.role, 'seeker');
  assert.ok(Object.values(aggregate.cardInstances).every((card) => Number.isInteger(card.drawOrder)));
  for (const deckId of new Set(Object.values(aggregate.cardInstances).map((card) => card.holderId))) {
    const orders = Object.values(aggregate.cardInstances)
      .filter((card) => card.holderId === deckId)
      .map((card) => card.drawOrder);
    assert.equal(new Set(orders).size, orders.length);
  }
});

test('match start leaves Bridge Troll out of the draw deck when the map has no bridges', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'small', 0.999999, 'none');
  const bridgeDefinition = contentPack.cards.find((card) =>
    card.effects.some((effect) => effect.effectType === 'bridge_troll_challenge')
  );
  assert.ok(bridgeDefinition);
  const bridgeCards = Object.values(aggregate.cardInstances).filter((card) => card.cardDefinitionId === bridgeDefinition.cardDefinitionId);

  assert.ok(bridgeCards.length > 0);
  assert.ok(bridgeCards.every((card) => card.zone === 'exile' && card.drawOrder === undefined));
});

function finishOneRound() {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = {
    requireStationCenteredZone: true,
    endgameRequiresOffTransit: true,
    foundDistanceMeters: 2,
    foundRequiresVisualConfirmation: true
  };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);

  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_hiding_zone', payload: { stationId: 'node/start', stationName: 'Start', latitude: point![1], longitude: point![0] } },
    30
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'lock_hider_location', payload: { latitude: point![1], longitude: point![0] } },
    31
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'end_hide_phase', payload: {} },
    32
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
    { type: 'set_final_hiding_spot', payload: { latitude: point![1], longitude: point![0], publiclyAccessible: true, within3mOfMarkedPath: true } },
    33
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'update_location', payload: { latitude: point![1], longitude: point![0], source: 'manual', onTransit: false } },
    34
  ), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId,
    { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
    { type: 'confirm_hider_found', payload: { latitude: point![1], longitude: point![0], visuallyIdentified: true } },
    35
  ), contentPack).aggregate;

  return { aggregate, contentPack, point };
}

test('starting the next round rotates the hider, resets round state and deck, and preserves the previous found spot', () => {
  const { aggregate: found, contentPack, point } = finishOneRound();
  const bonusCardId = moveCardToTeamHand(found, 'time-bonus-red', 'team-hider');
  found.cardInstances[bonusCardId] = { ...found.cardInstances[bonusCardId]!, zone: 'hand' };
  found.hiderHandLimitBonus = 2;
  found.disabledQuestionTemplateIds = ['matching-commercial-airport', 'photos-a-tree', 'radar-402'];
  found.questionRewardDrawBonus = { opportunitiesRemaining: 2, extraDrawCount: 1 };
  found.disabledQuestionCategoryId = 'matching';
  found.disabledQuestionCategorySourceCardInstanceId = 'spotty-memory-instance';
  found.seekerOffTransitRestriction = {
    sourceCardInstanceId: 'urban-explorer-instance',
    activatedAt: found.createdAt,
    statusByPlayerId: {}
  };
  found.zoologistChallenge = {
    sourceCardInstanceId: 'zoologist-instance',
    category: 'bird',
    hiderAttachmentId: 'attachment:hider-bird',
    requiredSeekerPlayerIds: ['hider-1'],
    attachmentIdBySeekerPlayerId: {},
    activatedAt: found.createdAt
  };
  found.luxuryCarChallenge = {
    sourceCardInstanceId: 'luxury-car-instance',
    hiderAttachmentId: 'attachment:hider-car',
    hiderCarDescription: '2020 Model X',
    hiderProductionYear: 2020,
    hiderMsrpCents: 8000000,
    currencyCode: 'USD',
    activatedAt: found.createdAt,
    usedAttachmentIds: ['attachment:seeker-car'],
    candidate: {
      attachmentId: 'attachment:seeker-car',
      submittedByPlayerId: 'hider-1',
      carDescription: '2022 Sedan',
      productionYear: 2022,
      msrpCents: 9000000,
      submittedAt: found.createdAt
    }
  };
  const started = executeCommand(found, makeEnvelope(found.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'start_next_round', payload: { nextHiderPlayerId: 'seeker-1' } },
    65
  ), contentPack);
  const next = started.aggregate;

  assert.equal(started.events[0]?.event.type, 'round_started');
  assert.equal(next.lifecycleState, 'hide_phase');
  assert.equal(next.hiderHandLimitBonus, 0);
  assert.deepEqual(next.disabledQuestionTemplateIds, []);
  assert.equal(next.questionRewardDrawBonus, undefined);
  assert.equal(next.disabledQuestionCategoryId, undefined);
  assert.equal(next.disabledQuestionCategorySourceCardInstanceId, undefined);
  assert.equal(next.seekerOffTransitRestriction, undefined);
  assert.equal(next.zoologistChallenge, undefined);
  assert.equal(next.luxuryCarChallenge, undefined);
  assert.equal(next.roleAssignments['seeker-1']?.role, 'hider');
  assert.equal(next.roleAssignments['hider-1']?.role, 'seeker');
  assert.deepEqual(next.teams['team-hider']?.memberPlayerIds, ['seeker-1']);
  assert.deepEqual(next.teams['team-seeker']?.memberPlayerIds, ['hider-1']);
  assert.deepEqual(next.roundStartLocation, { latitude: point![1], longitude: point![0] });
  assert.equal(next.hiddenState.hidingZone, undefined);
  assert.equal(next.hiddenState.finalHidingSpot, undefined);
  assert.equal(next.roundResults?.length, 1);
  assert.ok(Object.values(next.cardInstances).every((card) => card.zone === 'draw_pile' && card.holderType === 'deck'));
  assert.equal(new Set(Object.values(next.cardInstances).map((card) => card.drawOrder)).size, Object.keys(next.cardInstances).length);
  assert.equal(Object.values(next.timers).filter((timer) => timer.kind === 'hide').length, 1);
});

test('Bridge Troll stays exiled when each round deck is reset on a bridge-free map', () => {
  const { aggregate: found, contentPack } = finishOneRound();
  assert.ok(found.mapRegion);
  found.mapRegion.bridgeAvailability = 'none';
  const bridgeCardDefinition = contentPack.cards.find((card) =>
    card.effects.some((effect) => effect.effectType === 'bridge_troll_challenge')
  );
  assert.ok(bridgeCardDefinition);
  const bridgeCard = Object.values(found.cardInstances).find((card) => card.cardDefinitionId === bridgeCardDefinition.cardDefinitionId);
  assert.ok(bridgeCard);

  const next = executeCommand(found, makeEnvelope(found.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'start_next_round', payload: { nextHiderPlayerId: 'seeker-1' } },
    65
  ), contentPack).aggregate;

  assert.equal(next.cardInstances[bridgeCard.cardInstanceId]?.zone, 'exile');
  assert.ok(Object.values(next.cardInstances).filter((card) => card.cardDefinitionId !== bridgeCardDefinition.cardDefinitionId)
    .every((card) => card.zone === 'draw_pile'));
});

test('next-round preparation rejects a hider who is not a seeker and expires after ten minutes', () => {
  const { aggregate: found, contentPack } = finishOneRound();

  assert.throws(() => executeCommand(found, makeEnvelope(found.matchId,
    { actorId: 'host-1', playerId: 'host-1', role: 'host' },
    { type: 'start_next_round', payload: { nextHiderPlayerId: 'hider-1' } },
    36
  ), contentPack), /current seeker/);

  const tooLate = {
    ...makeEnvelope(found.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      { type: 'start_next_round', payload: { nextHiderPlayerId: 'seeker-1' } },
      636
    ),
    occurredAt: new Date(Date.parse(found.roundResults!.at(-1)!.foundAt) + 10 * 60 * 1000 + 1).toISOString()
  };
  assert.throws(() => executeCommand(found, tooLate, contentPack), /within 10 minutes/);
});
