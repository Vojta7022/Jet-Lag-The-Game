import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { buildQuestionFlowBootstrapCommands } from '../src/features/questions/question-flow-bootstrap.ts';
import {
  buildLocationUpdateCommand,
  buildMovementTrackViewModels,
  createInitialLocationShellState,
  locationShellReducer
} from '../src/features/location/location-state.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

test('location shell reducer makes denied and unavailable states explicit', () => {
  let state = createInitialLocationShellState();
  state = locationShellReducer(state, {
    type: 'availability_checked',
    availabilityState: 'unavailable'
  });
  assert.equal(state.permissionState, 'unavailable');

  state = locationShellReducer(createInitialLocationShellState(), {
    type: 'permission_requested',
    permissionState: 'denied'
  });
  assert.equal(state.permissionState, 'denied');
  assert.equal(Boolean(state.errorMessage), true);
});

test('movement flow preserves visible seeker breadcrumbs and map overlays through the runtime projection', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-location-1',
    authUserId: 'auth-host-location-1'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-location-flow',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection)
  );

  const afterMovement = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      buildLocationUpdateCommand({
        latitude: 50.081,
        longitude: 14.424,
        accuracyMeters: 14,
        recordedAt: '2026-01-01T00:10:00.000Z',
        source: 'manual'
      }),
      buildLocationUpdateCommand({
        latitude: 50.083,
        longitude: 14.438,
        accuracyMeters: 12,
        recordedAt: '2026-01-01T00:10:05.000Z',
        source: 'manual'
      })
    ]
  );

  const tracks = buildMovementTrackViewModels(afterMovement.projectionDelivery.projection);
  const overlayModel = buildMapOverlayModel({
    visibleMap: afterMovement.projectionDelivery.projection.visibleMap,
    visibleMovementTracks: afterMovement.projectionDelivery.projection.visibleMovementTracks
  });

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0]?.sampleCount, 2);
  assert.equal(tracks[0]?.recentSamples.length, 2);
  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Movement Breadcrumb'), true);
  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Visible Position'), true);

  await orchestrator.disconnect(created.connection);
});
