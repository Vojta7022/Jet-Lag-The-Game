import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { ensureMobileShellContentPack, mobileShellRulesetId } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import { mobileAppEnvironment } from '../src/config/env.ts';
import { buildMapSetupBootstrapCommands } from '../src/features/map/map-setup-flow.ts';
import { getGeometryBounds, geometryToSvgPath } from '../src/features/map/map-geometry.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

test('map bootstrap commands move a host match into map_setup and region selection initializes the bounded search area', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-1',
    authUserId: 'auth-host-1'
  };
  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-map-flow-match',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const bootstrapCommands = buildMapSetupBootstrapCommands(created.initialSync.projectionDelivery.projection);
  assert.equal(bootstrapCommands.length > 0, true);

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    bootstrapCommands
  );

  assert.equal(prepared.projectionDelivery.projection.lifecycleState, 'map_setup');
  assert.equal(prepared.projectionDelivery.projection.selectedRulesetId, mobileShellRulesetId);

  const selectedRegion = seedPlayableRegions[0]!;
  const applied = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [{
      type: 'create_map_region',
      payload: {
        regionId: selectedRegion.regionId,
        displayName: selectedRegion.displayName,
        regionKind: selectedRegion.regionKind,
        featureDatasetRefs: selectedRegion.featureDatasetRefs,
        geometry: selectedRegion.geometry
      }
    }]
  );

  assert.equal(applied.projectionDelivery.projection.visibleMap?.regionId, selectedRegion.regionId);
  assert.deepEqual(
    applied.projectionDelivery.projection.visibleMap?.playableBoundary.geometry,
    selectedRegion.geometry
  );
  assert.deepEqual(
    applied.projectionDelivery.projection.visibleMap?.remainingArea?.geometry,
    selectedRegion.geometry
  );
  assert.equal(
    applied.projectionDelivery.projection.visibleMap?.remainingArea?.clippedToRegion,
    true
  );

  await orchestrator.disconnect(created.connection);
});

test('map overlay helpers produce preview layers and bounded svg paths from the seeded region source', () => {
  const region = seedPlayableRegions[1]!;
  const overlayModel = buildMapOverlayModel({
    previewRegion: region
  });
  const bounds = getGeometryBounds(region.geometry);
  const path = geometryToSvgPath(region.geometry, bounds, {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Selected Boundary'), true);
  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Candidate Preview'), true);
  assert.equal(Boolean(bounds), true);
  assert.equal(path.startsWith('M '), true);
});
