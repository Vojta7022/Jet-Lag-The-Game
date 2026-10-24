import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { buildQuestionFlowBootstrapCommands } from '../src/features/questions/question-flow-bootstrap.ts';
import {
  canStartContinuousSharing,
  buildLiveLocationStatusModel,
  classifyLocationFreshness,
  describeLocationSampleAge,
  shouldAutomaticallyShareLocation,
  canSendSingleLocationUpdate,
  buildLocationUpdateCommand,
  buildMovementTrackViewModels,
  createInitialLocationShellState,
  locationShellReducer
} from '../src/features/location/location-state.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack;
}

test('location freshness uses the same 30-second usable-fix boundary as automatic clue answers', () => {
  const now = Date.parse('2026-10-24T12:00:30.000Z');
  assert.equal(classifyLocationFreshness('2026-10-24T12:00:00.000Z', now), 'fresh');
  assert.equal(classifyLocationFreshness('2026-10-24T11:59:59.000Z', now), 'stale');
  assert.equal(classifyLocationFreshness(undefined, now), 'unknown');
  assert.equal(classifyLocationFreshness('not-a-date', now), 'unknown');
  assert.equal(classifyLocationFreshness('2026-10-24T12:00:31.000Z', now), 'unknown');
});

test('location sample age is formatted for live map status chips', () => {
  const now = Date.parse('2026-10-24T12:03:05.000Z');
  assert.equal(describeLocationSampleAge('2026-10-24T12:03:00.000Z', now), '5 sec ago');
  assert.equal(describeLocationSampleAge('2026-10-24T12:00:00.000Z', now), '3 min ago');
  assert.equal(describeLocationSampleAge(undefined, now), 'No fix yet');
});

test('live location status separates the player fix from role-visible team pings', () => {
  const model = buildLiveLocationStatusModel({
    locationState: {
      ...createInitialLocationShellState(),
      permissionState: 'granted',
      sharingState: 'sharing',
      lastDeviceSample: {
        latitude: 50,
        longitude: 14,
        recordedAt: '2026-10-24T12:00:00.000Z',
        source: 'device'
      }
    },
    visibleMovementTracks: [
      {
        playerId: 'seeker-1',
        displayName: 'Seeker 1',
        role: 'seeker',
        sampleCount: 1,
        recentSamples: [],
        latestSample: {
          sampleId: 'sample-1',
          playerId: 'seeker-1',
          displayName: 'Seeker 1',
          role: 'seeker',
          latitude: 50,
          longitude: 14,
          source: 'device',
          recordedAt: '2026-10-24T11:59:00.000Z'
        }
      }
    ],
    viewerRole: 'hider',
    nowMilliseconds: Date.parse('2026-10-24T12:00:35.000Z'),
    maxAgeSeconds: 30
  });
  assert.equal(model.own.value, 'Stale · 35 sec ago');
  assert.equal(model.team.label, 'Seeker GPS');
  assert.equal(model.team.value, '1 stale');
  assert.equal(model.team.tone, 'warning');
});

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

test('hiders can share their live location while seekers remain eligible', () => {
  const ready = {
    ...createInitialLocationShellState(),
    permissionState: 'granted' as const,
    availabilityState: 'available' as const
  };
  assert.equal(canStartContinuousSharing('hider', ready), true);
  assert.equal(canSendSingleLocationUpdate('hider', ready), true);
});

test('live location sharing starts automatically for active player rounds and stops outside play phases', () => {
  const ready = {
    ...createInitialLocationShellState(),
    permissionState: 'granted' as const,
    availabilityState: 'available' as const
  };
  assert.equal(shouldAutomaticallyShareLocation('hide_phase', 'hider', ready), true);
  assert.equal(shouldAutomaticallyShareLocation('seek_phase', 'seeker', ready), true);
  assert.equal(shouldAutomaticallyShareLocation('endgame', 'hider', ready), true);
  assert.equal(shouldAutomaticallyShareLocation('lobby', 'seeker', ready), false);
  assert.equal(shouldAutomaticallyShareLocation('seek_phase', 'spectator', ready), false);
  assert.equal(shouldAutomaticallyShareLocation('seek_phase', 'seeker', { ...ready, frequencyMode: 'manual' }), false);
  assert.equal(shouldAutomaticallyShareLocation('seek_phase', 'seeker', { ...ready, permissionState: 'denied' }), false);
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
    buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection, { mode: 'demo' })
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
