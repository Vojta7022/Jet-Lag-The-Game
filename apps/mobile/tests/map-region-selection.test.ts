import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { ensureMobileShellContentPack, mobileShellRulesetId } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import { mobileAppEnvironment } from '../src/config/env.ts';
import { buildMapSetupBootstrapCommands } from '../src/features/map/map-setup-flow.ts';
import {
  buildMapCameraRegion,
  geometryToMapPolygons,
  getGeometryBounds,
  geometryToSvgPath
} from '../src/features/map/map-geometry.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';
import {
  createProviderBackedRegionDataSource,
  createSeedRegionDataSource
} from '../src/features/map/region-data-source.ts';
import {
  createNominatimRegionProvider,
  RegionProviderUnavailableError
} from '../src/features/map/osm-region-provider.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';
import type { GeoJsonGeometryModel } from '../../../packages/shared-types/src/index.ts';

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
  const cameraRegion = buildMapCameraRegion({
    previewRegion: region
  });
  const polygons = geometryToMapPolygons(region.geometry);
  const path = geometryToSvgPath(region.geometry, bounds, {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Selected Boundary'), true);
  assert.equal(overlayModel.overlays.some((overlay) => overlay.label === 'Candidate Preview'), true);
  assert.equal(Boolean(bounds), true);
  assert.equal(Boolean(cameraRegion), true);
  assert.equal(polygons.length > 0, true);
  assert.equal(path.startsWith('M '), true);
});

test('seed region data source supports searchable region lookup and fallback metadata', async () => {
  const dataSource = createSeedRegionDataSource(seedPlayableRegions);

  const pragueResults = await dataSource.searchRegions('Prague');
  const aliasResultsCzech = await dataSource.searchRegions('Praha');
  const aliasResults = await dataSource.searchRegions('Wien');
  const adminResults = await dataSource.searchRegions('Central Bohemia');
  const emptyResults = await dataSource.searchRegions('Atlantis');
  const byId = await dataSource.getRegionById('seed-central-bohemia');

  assert.equal(pragueResults.usingFallback, true);
  assert.equal(pragueResults.sourceLabel, 'Bundled seed region catalog');
  assert.equal(pragueResults.regions[0]?.displayName, 'Prague');
  assert.equal(aliasResultsCzech.regions[0]?.displayName, 'Prague');
  assert.equal(aliasResults.regions[0]?.displayName, 'Vienna');
  assert.equal(adminResults.regions[0]?.displayName, 'Central Bohemia');
  assert.equal(emptyResults.regions.length, 0);
  assert.equal(byId?.displayName, 'Central Bohemia');
});

test('nominatim provider maps real polygon search results and exact preview geometry', async () => {
  const pragueBoundary: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[14.2, 50.1], [14.7, 50.1], [14.7, 50.5], [14.2, 50.5], [14.2, 50.1]]]
  };

  let fetchCalls = 0;
  const provider = createNominatimRegionProvider({
    baseUrl: mobileAppEnvironment.regionProviderBaseUrl,
    throttleMs: 0,
    cacheTtlMs: 60_000,
    fetchFn: async () => {
      fetchCalls += 1;
      return new Response(JSON.stringify([
        {
          place_id: 1,
          osm_type: 'relation',
          osm_id: 438840,
          class: 'boundary',
          type: 'administrative',
          display_name: 'Prague, Czechia',
          namedetails: {
            name: 'Prague',
            'name:cs': 'Praha'
          },
          address: {
            city: 'Prague',
            country: 'Czechia'
          },
          geojson: pragueBoundary,
          importance: 0.9,
          place_rank: 16
        }
      ]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  });

  const results = await provider.searchRegions('Prague');
  const cachedResults = await provider.searchRegions('Prague');
  const previewOverlayModel = buildMapOverlayModel({
    previewRegion: results[0]
  });

  assert.equal(results[0]?.displayName, 'Prague');
  assert.equal(results[0]?.sourceKind, 'provider_catalog');
  assert.deepEqual(results[0]?.geometry, pragueBoundary);
  assert.equal(previewOverlayModel.overlays[0]?.geometry?.type, 'Polygon');
  assert.equal(fetchCalls, 1);
  assert.equal(cachedResults[0]?.regionId, results[0]?.regionId);
});

test('nominatim provider ignores incomplete candidates and safely maps partial result fields', async () => {
  const boundary: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[14.2, 50.1], [14.7, 50.1], [14.7, 50.5], [14.2, 50.5], [14.2, 50.1]]]
  };

  const provider = createNominatimRegionProvider({
    baseUrl: mobileAppEnvironment.regionProviderBaseUrl,
    throttleMs: 0,
    cacheTtlMs: 60_000,
    fetchFn: async () => new Response(JSON.stringify([
      {
        place_id: 1,
        osm_type: 'relation',
        osm_id: 438840,
        geojson: boundary
      },
      {
        place_id: 2,
        osm_type: 'relation',
        osm_id: 438841,
        class: 'boundary',
        type: 'administrative',
        address: {
          state: 'Prague Region',
          country: 'Czechia'
        },
        geojson: boundary
      }
    ]), {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    })
  });

  const results = await provider.searchRegions('Prague');

  assert.equal(results.length, 1);
  assert.equal(results[0]?.displayName, 'Prague Region');
  assert.equal(results[0]?.summary, 'Prague Region, Czechia');
  assert.equal(results[0]?.providerMetadata?.resultType, 'administrative');
});

test('provider-backed data source falls back to seeds only when the provider is unavailable', async () => {
  const dataSource = createProviderBackedRegionDataSource({
    provider: {
      providerKey: 'broken',
      providerLabel: 'Broken provider',
      async searchRegions() {
        throw new RegionProviderUnavailableError('Provider offline');
      },
      async getRegionById() {
        return undefined;
      }
    },
    fallback: createSeedRegionDataSource(seedPlayableRegions)
  });

  const response = await dataSource.searchRegions('Praha');

  assert.equal(response.usingFallback, true);
  assert.equal(response.regions[0]?.displayName, 'Prague');
  assert.match(response.noticeMessage ?? '', /fallback/i);
});

test('provider-returned boundaries apply through create_map_region into the bounded match state', async () => {
  const providerBoundary: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[14.3, 50.0], [14.8, 50.0], [14.8, 50.4], [14.3, 50.4], [14.3, 50.0]]]
  };
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-provider',
    authUserId: 'auth-host-provider'
  };
  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-provider-map-flow',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const bootstrapCommands = buildMapSetupBootstrapCommands(created.initialSync.projectionDelivery.projection);
  await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    bootstrapCommands
  );

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
        regionId: 'osm:relation:438840',
        displayName: 'Prague',
        regionKind: 'city',
        featureDatasetRefs: ['osm-nominatim', 'osm-admin-boundaries'],
        geometry: providerBoundary
      }
    }]
  );

  assert.deepEqual(applied.projectionDelivery.projection.visibleMap?.playableBoundary.geometry, providerBoundary);
  assert.deepEqual(applied.projectionDelivery.projection.visibleMap?.remainingArea?.geometry, providerBoundary);

  await orchestrator.disconnect(created.connection);
});
