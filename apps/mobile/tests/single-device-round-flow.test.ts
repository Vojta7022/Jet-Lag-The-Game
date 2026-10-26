import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';
import { representativePointFromGeometry } from '../../../packages/geo/src/index.ts';
import { InMemoryRuntimePersistence } from '../../../packages/transport/src/index.ts';
import { makeSquarePolygon } from '../../../tests/engine/helpers.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { buildMapSetupBootstrapCommands } from '../src/features/map/map-setup-flow.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack;
}

test('single-device referee can complete a rule-based round through found and score', async () => {
  const contentPack = loadContentPack();
  const persistence = new InMemoryRuntimePersistence();
  let now = new Date('2026-01-01T00:00:00.000Z');
  let orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment,
    singleDevicePersistence: persistence,
    clock: () => new Date(now)
  });
  const hostProfile = { displayName: 'Referee', playerId: 'host-round-1' };
  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'single_device_referee',
    matchId: 'single-device-full-round',
    initialScale: 'small'
  });
  let activeConnection = created.connection;
  const host = { actorId: hostProfile.playerId, playerId: hostProfile.playerId, role: 'host' as const };

  const mapSetup = await orchestrator.submitCommands(
    activeConnection,
    host,
    [
      ...buildMapSetupBootstrapCommands(created.initialSync.projectionDelivery.projection),
      {
        type: 'create_map_region',
        payload: {
          regionId: 'round-boundary',
          displayName: 'Prague',
          regionKind: 'city',
          featureDatasetRefs: ['osm-core', 'transit-registry'],
          geometry: makeSquarePolygon(),
          bridgeAvailability: 'present'
        }
      }
    ]
  );
  assert.equal(mapSetup.projectionDelivery.projection.lifecycleState, 'map_setup');

  const started = await orchestrator.submitCommands(activeConnection, host, [{ type: 'start_match', payload: {} }]);
  const hider = started.projectionDelivery.projection.players.find((player) => player.role === 'hider');
  const seeker = started.projectionDelivery.projection.players.find((player) => player.role === 'seeker');
  const point = representativePointFromGeometry(started.projectionDelivery.projection.visibleMap?.playableBoundary.geometry);
  assert.ok(hider && seeker && point);

  const hiding = await orchestrator.submitCommands(activeConnection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [
      { type: 'set_hiding_zone', payload: { stationId: 'node/round-start', stationName: 'Central Station', latitude: point[1], longitude: point[0] } },
      { type: 'lock_hider_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5 } }
    ]
  );
  assert.ok(hiding.projectionDelivery.projection.hiddenState?.hiderLocation);

  await orchestrator.disconnect(activeConnection);
  orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment,
    singleDevicePersistence: persistence,
    clock: () => new Date(now)
  });
  const resumed = await orchestrator.resumeSingleDeviceMatch('single-device-full-round', hostProfile);
  assert.ok(resumed, 'the referee can reattach after the app/runtime restarts');
  activeConnection = resumed.connection;
  const recoveredHide = await orchestrator.refresh(activeConnection);
  assert.equal(recoveredHide.projectionDelivery.projection.lifecycleState, 'hide_phase');
  assert.ok(recoveredHide.projectionDelivery.projection.hiddenState?.hiderLocation);

  const hideTimer = started.projectionDelivery.projection.visibleTimers.find((timer) => timer.kind === 'hide');
  assert.ok(hideTimer);
  now = new Date(Date.parse(hideTimer.startedAt) + hideTimer.durationSeconds * 1000);
  const seekPhase = await orchestrator.refresh(activeConnection);
  assert.equal(seekPhase.projectionDelivery.projection.lifecycleState, 'seek_phase');

  await orchestrator.submitCommands(activeConnection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5, source: 'device', onTransit: true } }]
  );
  await orchestrator.submitCommands(activeConnection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5, source: 'device' } }]
  );
  const radar = contentPack.questionTemplates.find((template) => template.templateId === 'radar-402');
  assert.ok(radar, 'the small-scale Investigation Book includes the 500 m Radar question');

  const asked = await orchestrator.submitCommands(activeConnection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [
      { type: 'begin_question_prompt', payload: {} },
      { type: 'ask_question', payload: { questionInstanceId: 'question:round-radar', templateId: radar.templateId, targetTeamId: 'team-hider' } }
    ]
  );
  const resolved = asked;
  const resolvedRadar = resolved.projectionDelivery.projection.visibleQuestions.find((question) => question.questionInstanceId === 'question:round-radar');
  assert.equal(resolvedRadar?.status, 'resolved');
  assert.equal(resolvedRadar?.answer?.value, 'yes');
  assert.equal(resolvedRadar?.automaticResolution?.resolverVersion, 'jetlag-location-v2');
  assert.equal(resolved.projectionDelivery.projection.seekPhaseSubstate, 'ready');
  assert.equal(resolved.projectionDelivery.projection.visibleMap?.history.length, 1);
  assert.equal(resolved.projectionDelivery.projection.visibleConstraints[0]?.sourceQuestionInstanceId, 'question:round-radar');

  const rewardDealt = await orchestrator.submitCommands(activeConnection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'deal_question_reward', payload: { questionInstanceId: 'question:round-radar' } }]
  );
  const rewardSet = rewardDealt.projectionDelivery.projection.pendingQuestionReward?.sets[0];
  assert.ok(rewardSet);
  assert.equal(rewardSet.cardInstanceIds.length, 2, 'Radar pays Draw 2');
  const rewardChosen = await orchestrator.submitCommands(activeConnection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'choose_question_reward', payload: {
      questionInstanceId: 'question:round-radar',
      selectedCardInstanceIdsBySet: [[rewardSet.cardInstanceIds[0]!]]
    } }]
  );
  assert.equal(rewardChosen.projectionDelivery.projection.pendingQuestionReward, undefined);
  assert.equal(rewardChosen.projectionDelivery.projection.visibleCards.filter((card) => card.zone === 'hand').length, 1);
  assert.equal(rewardChosen.projectionDelivery.projection.visibleCards.filter((card) => card.zone === 'reward_selection').length, 0);

  await orchestrator.submitCommands(activeConnection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'set_final_hiding_spot', payload: { latitude: point[1], longitude: point[0], publiclyAccessible: true, within3mOfMarkedPath: true } }]
  );

  const endgame = await orchestrator.submitCommands(activeConnection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], source: 'manual', onTransit: false } }]
  );
  assert.equal(endgame.projectionDelivery.projection.lifecycleState, 'endgame');
  assert.ok(endgame.projectionDelivery.projection.hiddenState?.finalHidingSpot);

  const found = await orchestrator.submitCommands(activeConnection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'confirm_hider_found', payload: { latitude: point[1], longitude: point[0], visuallyIdentified: true } }]
  );

  assert.equal(found.projectionDelivery.projection.lifecycleState, 'game_complete');
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.length, 1);
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.[0]?.hiderPlayerId, hider.playerId);
  const matchStartedAt = started.projectionDelivery.projection.visibleEventLog.find((event) => event.type === 'match_started')?.occurredAt;
  const roundResult = found.projectionDelivery.projection.visibleRoundResults?.[0];
  assert.ok(matchStartedAt && roundResult?.foundAt);
  assert.equal(roundResult.survivalSeconds, (Date.parse(roundResult.foundAt) - Date.parse(matchStartedAt)) / 1000);
  assert.ok(roundResult.survivalSeconds >= hideTimer.durationSeconds, 'the hider cannot be found before the hide timer expires');
  assert.equal(roundResult.finalHidingTimeSeconds, roundResult.survivalSeconds + (roundResult.timeBonusSeconds ?? 0));

  const rotationOrder = found.projectionDelivery.projection.hiderRotationOrder;
  assert.deepEqual(rotationOrder, [hider.playerId, seeker.playerId]);
  const secondRound = await orchestrator.submitCommands(activeConnection, host, [{
    type: 'start_next_round',
    payload: { nextHiderPlayerId: rotationOrder[1]! }
  }]);
  assert.equal(secondRound.projectionDelivery.projection.lifecycleState, 'hide_phase');
  assert.equal(secondRound.projectionDelivery.projection.visibleRoundResults?.length, 1);
  assert.deepEqual(secondRound.projectionDelivery.projection.roundStartLocation, { latitude: point[1], longitude: point[0] });
  assert.equal(secondRound.projectionDelivery.projection.players.find((player) => player.playerId === seeker.playerId)?.role, 'hider');
  assert.equal(secondRound.projectionDelivery.projection.players.find((player) => player.playerId === hider.playerId)?.role, 'seeker');
  assert.ok(secondRound.projectionDelivery.projection.visibleCards.every((card) => card.zone === 'draw_pile'));

  const secondHider = secondRound.projectionDelivery.projection.players.find((player) => player.role === 'hider');
  const secondSeeker = secondRound.projectionDelivery.projection.players.find((player) => player.role === 'seeker');
  assert.ok(secondHider && secondSeeker);
  await orchestrator.submitCommands(activeConnection,
    { actorId: secondHider.playerId, playerId: secondHider.playerId, role: 'hider' },
    [
      { type: 'set_hiding_zone', payload: { stationId: 'node/round-two', stationName: 'Found Station', latitude: point[1], longitude: point[0] } },
      { type: 'lock_hider_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5 } }
    ]
  );
  const secondHideTimer = secondRound.projectionDelivery.projection.visibleTimers.find((timer) => timer.kind === 'hide');
  assert.ok(secondHideTimer);
  now = new Date(Date.parse(secondHideTimer.startedAt) + secondHideTimer.durationSeconds * 1000);
  const secondSeek = await orchestrator.refresh(activeConnection);
  assert.equal(secondSeek.projectionDelivery.projection.lifecycleState, 'seek_phase');

  await orchestrator.submitCommands(activeConnection,
    { actorId: secondSeeker.playerId, playerId: secondSeeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5, source: 'device', onTransit: true } }]
  );
  await orchestrator.submitCommands(activeConnection,
    { actorId: secondHider.playerId, playerId: secondHider.playerId, role: 'hider' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5, source: 'device' } }]
  );
  await orchestrator.submitCommands(activeConnection,
    { actorId: secondHider.playerId, playerId: secondHider.playerId, role: 'hider' },
    [{ type: 'set_final_hiding_spot', payload: { latitude: point[1], longitude: point[0], publiclyAccessible: true, within3mOfMarkedPath: true } }]
  );
  const secondEndgame = await orchestrator.submitCommands(activeConnection,
    { actorId: secondSeeker.playerId, playerId: secondSeeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], source: 'manual', onTransit: false } }]
  );
  assert.equal(secondEndgame.projectionDelivery.projection.lifecycleState, 'endgame');
  const finalMatch = await orchestrator.submitCommands(activeConnection,
    { actorId: secondSeeker.playerId, playerId: secondSeeker.playerId, role: 'seeker' },
    [{ type: 'confirm_hider_found', payload: { latitude: point[1], longitude: point[0], visuallyIdentified: true } }]
  );
  assert.equal(finalMatch.projectionDelivery.projection.lifecycleState, 'game_complete');
  assert.equal(finalMatch.projectionDelivery.projection.visibleRoundResults?.length, 2);
  assert.deepEqual(finalMatch.projectionDelivery.projection.visibleRoundResults?.map((result) => result.hiderPlayerId), rotationOrder);
  await assert.rejects(
    () => orchestrator.submitCommands(activeConnection, host, [{ type: 'start_next_round', payload: { nextHiderPlayerId: hider.playerId } }]),
    /Every player in the hider rotation has completed their round/
  );
  await orchestrator.disconnect(activeConnection);
});
