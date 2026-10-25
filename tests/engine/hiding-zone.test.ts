import assert from 'node:assert/strict';
import test from 'node:test';

import { buildMatchProjection } from '../../packages/engine/src/index.ts';
import { representativePointFromGeometry } from '../../packages/geo/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';
import { reconcileRuntimeState } from '../../packages/transport/src/reconcile-runtime-state.ts';
import { loadEngineTestContentPack, makeEnvelope, moveCardToTeamHand, setupMatchToHidePhase } from './helpers.ts';

test('hider can set a hidden station-centered zone using the selected scale radius', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'medium');
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);

  const result = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: {
      stationId: 'node/123',
      stationName: 'Central Station',
      latitude: point![1],
      longitude: point![0]
    }
  } as never, 30), contentPack);

  assert.equal(result.aggregate.hiddenState.hidingZone?.stationId, 'node/123');
  assert.equal(result.aggregate.hiddenState.hidingZone?.radiusMeters, 500);
  assert.ok(result.aggregate.hiddenState.hidingZone?.selectedAt);
});

test('hiding zone must match the authority loaded transit station', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'medium');
  aggregate.mode = 'online';
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const station = {
    featureId: 'osm:node/123',
    featureClassId: 'rail-station',
    label: 'Central Station',
    latitude: point[1],
    longitude: point[0],
    geometrySupport: 'point' as const,
    coverage: 'approximate' as const
  };
  const dataset = {
    source: 'OpenStreetMap' as const,
    sourceUrl: 'https://www.openstreetmap.org/copyright',
    sourceVersion: 'test',
    retrievedAt: '2026-10-25T12:00:00.000Z',
    coverage: 'approximate' as const,
    features: [station]
  };
  const command = {
    type: 'set_hiding_zone' as const,
    payload: { stationId: 'node/999', stationName: 'Central Station', latitude: point[1], longitude: point[0] }
  } as never;

  const verified = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point[1], longitude: point[0] }
  } as never, 29), contentPack, dataset);
  assert.equal(verified.aggregate.hiddenState.hidingZone?.stationId, 'node/123');

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, command, 30), contentPack, dataset), /authority-verified map data/);
});

test('station-centered zone is private from seekers and visible to hider and referee', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack, 'large');
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const updated = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  } as never, 31), contentPack).aggregate;

  const seeker = buildMatchProjection(updated, contentPack, { scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker' });
  const hider = buildMatchProjection(updated, contentPack, { scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider' });
  const referee = buildMatchProjection(updated, contentPack, { scope: 'host_admin', viewerPlayerId: 'host-1', viewerRole: 'host' });
  const publicHiderRequest = buildMatchProjection(updated, contentPack, { scope: 'public_match', viewerPlayerId: 'hider-1', viewerRole: 'hider' });
  assert.equal(seeker.hiddenState, undefined);
  assert.equal(hider.hiddenState?.hidingZone?.radiusMeters, 1000);
  assert.equal(hider.hiddenState?.hiderLocation, undefined);
  assert.equal(hider.hiddenState?.hiderLocationLocked, false);
  assert.equal(referee.hiddenState?.hidingZone?.stationId, 'node/123');
  assert.equal(publicHiderRequest.hiddenState, undefined);
});

test('standard rules require zone selection and station arrival before the hide timer can end', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = { requireStationCenteredZone: true };
  const aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  const locked = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'lock_hider_location',
    payload: { latitude: point![1], longitude: point![0], accuracyMeters: 10 }
  }, 50), contentPack).aggregate;

  assert.throws(() => executeCommand(locked, makeEnvelope(locked.matchId, {
    actorId: 'system-runtime', role: 'system'
  }, { type: 'end_hide_phase', payload: {} }, 51), contentPack), /station-centered hiding zone/);
});

test('confirming station arrival completes the hide phase automatically at timer expiry', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = { requireStationCenteredZone: true };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  }, 60), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'lock_hider_location',
    payload: { latitude: point![1], longitude: point![0], accuracyMeters: 10 }
  }, 61), contentPack).aggregate;
  const hideTimer = Object.values(aggregate.timers).find((timer) => timer.kind === 'hide');
  assert.ok(hideTimer);

  const reconciled = reconcileRuntimeState({
    aggregate,
    contentPack,
    occurredAt: new Date(Date.parse(hideTimer!.startedAt) + hideTimer!.durationSeconds * 1000 + 1).toISOString()
  });
  assert.equal(reconciled.aggregate.lifecycleState, 'seek_phase');
});

test('hider movement after the hide phase stays inside the selected zone', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = { requireStationCenteredZone: true };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  }, 70), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'lock_hider_location',
    payload: { latitude: point![1], longitude: point![0], accuracyMeters: 10 }
  }, 71), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'end_hide_phase', payload: {} }, 72), contentPack).aggregate;

  assert.doesNotThrow(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'update_location',
    payload: { latitude: point![1] + 0.001, longitude: point![0], source: 'manual' }
  }, 73), contentPack));
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'update_location',
    payload: { latitude: point![1] + 0.02, longitude: point![0], source: 'manual' }
  }, 74), contentPack), /outside the selected hiding zone/);
});

test('endgame begins when a seeker reports entering the hiding zone off transit', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = { requireStationCenteredZone: true, endgameRequiresOffTransit: true };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  } as never, 80), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'lock_hider_location',
    payload: { latitude: point![1], longitude: point![0], accuracyMeters: 10 }
  }, 81), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'end_hide_phase', payload: {} }, 82), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_final_hiding_spot',
    payload: { latitude: point![1] + 0.0001, longitude: point![0], publiclyAccessible: true, within3mOfMarkedPath: true }
  } as never, 83), contentPack).aggregate;

  const stillSeeking = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: { latitude: point![1] + 0.0002, longitude: point![0], source: 'manual', onTransit: true }
  } as never, 84), contentPack).aggregate;
  assert.equal(stillSeeking.lifecycleState, 'seek_phase');

  const update = executeCommand(stillSeeking, makeEnvelope(stillSeeking.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: { latitude: point![1] + 0.0002, longitude: point![0], source: 'manual', onTransit: false }
  } as never, 85), contentPack);
  const updated = update.aggregate;

  assert.equal(updated.lifecycleState, 'endgame');
  assert.equal(updated.hiddenState.endgame?.finalHidingSpot.latitude, point![1] + 0.0001);
  const seekerView = buildMatchProjection(updated, contentPack, {
    scope: 'team_private', viewerPlayerId: 'seeker-1', viewerTeamId: 'team-seeker', viewerRole: 'seeker'
  });
  const hiderView = buildMatchProjection(updated, contentPack, {
    scope: 'team_private', viewerPlayerId: 'hider-1', viewerTeamId: 'team-hider', viewerRole: 'hider'
  });
  assert.equal(seekerView.hiddenState?.finalHidingSpot, undefined);
  assert.equal(hiderView.hiddenState?.finalHidingSpot?.latitude, point![1] + 0.0001);
  assert.equal(JSON.stringify(update.events.find((event) => event.event.type === 'endgame_started')?.event).includes('latitude'), false);
});

test('finding requires a visual confirmation and seeker coordinates within two meters', () => {
  const contentPack = loadEngineTestContentPack();
  contentPack.rulesets[0]!.locationPolicies = { requireStationCenteredZone: true, endgameRequiresOffTransit: true, foundDistanceMeters: 2, foundRequiresVisualConfirmation: true };
  let aggregate = setupMatchToHidePhase(contentPack);
  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central Station', latitude: point![1], longitude: point![0] }
  } as never, 90), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'lock_hider_location',
    payload: { latitude: point![1], longitude: point![0], accuracyMeters: 10 }
  }, 91), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'end_hide_phase', payload: {} }, 92), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, {
    type: 'set_final_hiding_spot',
    payload: { latitude: point![1] + 0.0001, longitude: point![0], publiclyAccessible: true, within3mOfMarkedPath: true }
  } as never, 93), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'update_location',
    payload: { latitude: point![1] + 0.0002, longitude: point![0], source: 'manual', onTransit: false }
  } as never, 94), contentPack).aggregate;

  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'confirm_hider_found',
    payload: { latitude: point![1] + 0.0002, longitude: point![0], visuallyIdentified: true }
  } as never, 95), contentPack), /within 2 meters/);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'confirm_hider_found',
    payload: { latitude: point![1] + 0.0001, longitude: point![0], visuallyIdentified: false }
  } as never, 96), contentPack), /[Vv]isual identification/);
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'pause_match', payload: { reason: 'Scheduled break' } }, 97), contentPack).aggregate;
  aggregate = executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'host-1', playerId: 'host-1', role: 'host'
  }, { type: 'resume_match', payload: {} }, 107), contentPack).aggregate;
  const heldTimeBonusCardId = moveCardToTeamHand(aggregate, 'time-bonus-red', 'team-hider');
  moveCardToTeamHand(aggregate, 'power-up-duplicate', 'team-hider');
  const discardedTimeBonusCardId = moveCardToTeamHand(aggregate, 'time-bonus-blue', 'team-hider');
  aggregate.cardInstances[discardedTimeBonusCardId] = {
    ...aggregate.cardInstances[discardedTimeBonusCardId]!,
    zone: 'discard_pile'
  };
  const foundAt = makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'confirm_hider_found',
    payload: { latitude: point![1] + 0.0001, longitude: point![0], visuallyIdentified: true }
  } as never, 108);
  const found = executeCommand(aggregate, foundAt, contentPack).aggregate;
  assert.equal(found.lifecycleState, 'game_complete');
  assert.equal(found.roundResults?.at(-1)?.hiderTeamId, 'team-hider');
  const startedAt = aggregate.eventLog.find((event) => event.type === 'match_started')?.occurredAt;
  assert.ok(startedAt);
  const expectedSurvival = Math.floor((Date.parse(foundAt.occurredAt) - Date.parse(startedAt!) - 10_000) / 1000);
  assert.equal(found.roundResults?.at(-1)?.survivalSeconds, expectedSurvival);
  const heldTimeBonus = contentPack.cards.find((card) => card.cardDefinitionId === aggregate.cardInstances[heldTimeBonusCardId]!.cardDefinitionId);
  const expectedBonusSeconds = Number((heldTimeBonus?.effects[0]?.payload as { minutesByScale?: Record<string, number> } | undefined)?.minutesByScale?.[aggregate.selectedScale ?? 'small'] ?? 0) * 60;
  assert.equal(found.roundResults?.at(-1)?.timeBonusSeconds, expectedBonusSeconds * 2);
  assert.equal(found.roundResults?.at(-1)?.finalHidingTimeSeconds, expectedSurvival + expectedBonusSeconds * 2);
});

test('hiding-zone command rejects stations outside the map and rejects seeker access', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);
  const command = {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/outside', stationName: 'Outside', latitude: 0, longitude: 0 }
  } as never;
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'hider-1', playerId: 'hider-1', role: 'hider'
  }, command, 40), contentPack), /full hiding zone must fit inside/);

  const point = representativePointFromGeometry(aggregate.mapRegion?.boundaryGeometry);
  assert.ok(point);
  assert.throws(() => executeCommand(aggregate, makeEnvelope(aggregate.matchId, {
    actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker'
  }, {
    type: 'set_hiding_zone',
    payload: { stationId: 'node/123', stationName: 'Central', latitude: point![1], longitude: point![0] }
  } as never, 41), contentPack), /does not have permission/);
});
