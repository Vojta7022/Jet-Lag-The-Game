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
import { findActiveQuestion, findQuestionCategory, findQuestionTemplate } from '../src/features/questions/question-catalog.ts';
import { buildConstraintResolutionMetadata, chooseConstraintIdForQuestion } from '../src/features/questions/question-flow-state.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

test('single-device referee can complete a rule-based round through found and score', async () => {
  const contentPack = loadContentPack();
  let now = new Date('2026-01-01T00:00:00.000Z');
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment,
    singleDevicePersistence: new InMemoryRuntimePersistence(),
    clock: () => new Date(now)
  });
  const hostProfile = { displayName: 'Referee', playerId: 'host-round-1' };
  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'single_device_referee',
    matchId: 'single-device-full-round',
    initialScale: 'small'
  });
  const host = { actorId: hostProfile.playerId, playerId: hostProfile.playerId, role: 'host' as const };

  const mapSetup = await orchestrator.submitCommands(
    created.connection,
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
          geometry: makeSquarePolygon()
        }
      }
    ]
  );
  assert.equal(mapSetup.projectionDelivery.projection.lifecycleState, 'map_setup');

  const started = await orchestrator.submitCommands(created.connection, host, [{ type: 'start_match', payload: {} }]);
  const hider = started.projectionDelivery.projection.players.find((player) => player.role === 'hider');
  const seeker = started.projectionDelivery.projection.players.find((player) => player.role === 'seeker');
  const point = representativePointFromGeometry(started.projectionDelivery.projection.visibleMap?.playableBoundary.geometry);
  assert.ok(hider && seeker && point);

  const hiding = await orchestrator.submitCommands(created.connection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [
      { type: 'set_hiding_zone', payload: { stationId: 'node/round-start', stationName: 'Central Station', latitude: point[1], longitude: point[0] } },
      { type: 'lock_hider_location', payload: { latitude: point[1], longitude: point[0], accuracyMeters: 5 } }
    ]
  );
  assert.ok(hiding.projectionDelivery.projection.hiddenState?.hiderLocation);

  const hideTimer = started.projectionDelivery.projection.visibleTimers.find((timer) => timer.kind === 'hide');
  assert.ok(hideTimer);
  now = new Date(Date.parse(hideTimer.startedAt) + hideTimer.durationSeconds * 1000);
  const seekPhase = await orchestrator.refresh(created.connection);
  assert.equal(seekPhase.projectionDelivery.projection.lifecycleState, 'seek_phase');

  await orchestrator.submitCommands(created.connection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], source: 'manual', onTransit: true } }]
  );
  const radar = contentPack.questionTemplates.find((template) => template.templateId === 'radar-402');
  assert.ok(radar, 'the small-scale Investigation Book includes the 500 m Radar question');

  const asked = await orchestrator.submitCommands(created.connection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [
      { type: 'begin_question_prompt', payload: {} },
      { type: 'ask_question', payload: { questionInstanceId: 'question:round-radar', templateId: radar.templateId, targetTeamId: 'team-hider' } }
    ]
  );
  assert.equal(asked.projectionDelivery.projection.seekPhaseSubstate, 'awaiting_question_answer');

  const answered = await orchestrator.submitCommands(created.connection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'answer_question', payload: { questionInstanceId: 'question:round-radar', answer: { value: 'yes' } } }]
  );
  const activeQuestion = findActiveQuestion(answered.projectionDelivery.projection);
  assert.ok(activeQuestion);
  const template = findQuestionTemplate(contentPack, activeQuestion!.templateId);
  const category = findQuestionCategory(contentPack, activeQuestion!.categoryId);
  assert.ok(template && category);
  const constraintId = chooseConstraintIdForQuestion({ category: category!, template: template!, question: activeQuestion! });
  assert.ok(constraintId);

  const resolved = await orchestrator.submitCommands(created.connection,
    host,
    [{ type: 'apply_constraint', payload: {
      questionInstanceId: activeQuestion!.questionInstanceId,
      constraintId: constraintId!,
      metadata: buildConstraintResolutionMetadata({
        contentPack,
        visibleMap: answered.projectionDelivery.projection.visibleMap,
        template: template!,
        question: activeQuestion!
      })
    } }]
  );
  assert.equal(resolved.projectionDelivery.projection.seekPhaseSubstate, 'ready');
  assert.equal(resolved.projectionDelivery.projection.visibleMap?.history.length, 1);
  assert.equal(resolved.projectionDelivery.projection.visibleConstraints[0]?.sourceQuestionInstanceId, 'question:round-radar');

  await orchestrator.submitCommands(created.connection,
    { actorId: hider.playerId, playerId: hider.playerId, role: 'hider' },
    [{ type: 'set_final_hiding_spot', payload: { latitude: point[1], longitude: point[0], publiclyAccessible: true, within3mOfMarkedPath: true } }]
  );

  const endgame = await orchestrator.submitCommands(created.connection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'update_location', payload: { latitude: point[1], longitude: point[0], source: 'manual', onTransit: false } }]
  );
  assert.equal(endgame.projectionDelivery.projection.lifecycleState, 'endgame');
  assert.ok(endgame.projectionDelivery.projection.hiddenState?.finalHidingSpot);

  const found = await orchestrator.submitCommands(created.connection,
    { actorId: seeker.playerId, playerId: seeker.playerId, role: 'seeker' },
    [{ type: 'confirm_hider_found', payload: { latitude: point[1], longitude: point[0], visuallyIdentified: true } }]
  );

  assert.equal(found.projectionDelivery.projection.lifecycleState, 'game_complete');
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.length, 1);
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.[0]?.hiderPlayerId, hider.playerId);
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.[0]?.survivalSeconds, hideTimer.durationSeconds);
  assert.equal(found.projectionDelivery.projection.visibleRoundResults?.[0]?.finalHidingTimeSeconds, hideTimer.durationSeconds);
  await orchestrator.disconnect(created.connection);
});
