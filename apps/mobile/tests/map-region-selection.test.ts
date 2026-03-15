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
  geometryToSvgPath,
  geometryToSvgPolygonPaths
} from '../src/features/map/map-geometry.ts';
import { buildMapOverlayModel } from '../src/features/map/map-overlays.ts';
import {
  addRegionToSelection,
  analyzeCompositeRegionWarning,
  buildCompositePlayableRegion,
  clearSelectedRegions,
  removeRegionFromSelection
} from '../src/features/map/composite-region-builder.ts';
import {
  createProviderBackedRegionDataSource,
  createSeedRegionDataSource
} from '../src/features/map/region-data-source.ts';
import {
  createNominatimRegionProvider,
  RegionProviderRateLimitError,
  RegionProviderUnavailableError
} from '../src/features/map/osm-region-provider.ts';
import { seedPlayableRegions } from '../src/features/map/seed-regions.ts';
import {
  resolveRegionSearchSelection,
  shouldApplyExternalRegionSearchValue
} from '../src/features/map/use-region-search.ts';
import type {
  GeoJsonGeometryModel
} from '../../../packages/shared-types/src/index.ts';
import type { PlayableRegionCatalogEntry } from '../src/features/map/region-types.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

function asProviderRegion(
  region: PlayableRegionCatalogEntry,
  overrides: Partial<PlayableRegionCatalogEntry> = {}
): PlayableRegionCatalogEntry {
  return {
    ...region,
    ...overrides,
    sourceKind: 'provider_catalog',
    sourceLabel: 'OpenStreetMap Nominatim',
    providerMetadata: {
      providerKey: 'osm_nominatim',
      providerLabel: 'OpenStreetMap Nominatim',
      boundarySource: 'search_geometry'
    }
  };
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

test('region search restore guards ignore echoed Praha draft updates and replace stale selections', () => {
  const prague = seedPlayableRegions[0]!;
  const centralBohemia = seedPlayableRegions[1]!;

  assert.equal(shouldApplyExternalRegionSearchValue('Praha', 'Praha'), false);
  assert.equal(shouldApplyExternalRegionSearchValue(undefined, 'Praha'), true);
  assert.equal(shouldApplyExternalRegionSearchValue('Prague', 'Praha'), true);

  const staleSelection = resolveRegionSearchSelection({
    currentRegion: prague,
    regions: [centralBohemia],
    selectedRegionId: centralBohemia.regionId
  });
  const preservedSelection = resolveRegionSearchSelection({
    currentRegion: prague,
    regions: [prague, centralBohemia],
    selectedRegionId: centralBohemia.regionId
  });

  assert.equal(staleSelection?.regionId, centralBohemia.regionId);
  assert.equal(preservedSelection?.regionId, prague.regionId);
});

test('composite region builder adds, removes, and clears selected regions without duplicates', () => {
  const prague = seedPlayableRegions[0]!;
  const centralBohemia = seedPlayableRegions[1]!;

  const addedOnce = addRegionToSelection([], prague);
  const addedTwice = addRegionToSelection(addedOnce, prague);
  const addedMultiple = addRegionToSelection(addedTwice, centralBohemia);
  const removed = removeRegionFromSelection(addedMultiple, prague.regionId);
  const cleared = clearSelectedRegions();

  assert.equal(addedOnce.length, 1);
  assert.equal(addedTwice.length, 1);
  assert.equal(addedMultiple.length, 2);
  assert.equal(removed.length, 1);
  assert.equal(removed[0]?.regionId, centralBohemia.regionId);
  assert.deepEqual(cleared, []);
});

test('composite region builder previews multiple selected regions as one combined playable region and warns when disconnected', () => {
  const prague = seedPlayableRegions[0]!;
  const centralBohemia = seedPlayableRegions[1]!;
  const vienna = seedPlayableRegions[2]!;

  const connectedComposite = buildCompositePlayableRegion([prague, centralBohemia]);
  const disconnectedComposite = buildCompositePlayableRegion([prague, vienna]);
  const disconnectedWarning = analyzeCompositeRegionWarning([prague, vienna]);
  const previewOverlayModel = buildMapOverlayModel({
    previewRegion: connectedComposite
  });

  assert.equal(connectedComposite?.regionKind, 'custom');
  assert.equal(connectedComposite?.geometry.type, 'MultiPolygon');
  assert.equal(connectedComposite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(connectedComposite?.compositeMetadata?.componentRegions.length, 2);
  assert.equal(
    previewOverlayModel.overlays.some((overlay) => overlay.label === 'Composite Boundary'),
    true
  );
  assert.equal(Boolean(disconnectedComposite?.compositeMetadata?.disconnectedWarning), true);
  assert.equal(disconnectedWarning?.connectedGroupCount, 2);
});

test('composite region builder keeps enclosed-region components in the stable raw preview geometry', () => {
  const prague = seedPlayableRegions[0]!;
  const centralBohemia = seedPlayableRegions[1]!;

  const composite = buildCompositePlayableRegion([prague, centralBohemia]);

  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.deepEqual(composite?.geometry, composite?.compositeMetadata?.rawCombinedGeometry);
  assert.equal((composite?.compositeMetadata?.componentRegions ?? []).length, 2);
});

test('provider-backed Prague plus Central Bohemia keeps both exact component boundaries in the stable raw preview', () => {
  const prague = asProviderRegion(seedPlayableRegions[0]!, { regionId: 'osm:relation:prague' });
  const centralBohemia = asProviderRegion(seedPlayableRegions[1]!, { regionId: 'osm:relation:central-bohemia' });

  const composite = buildCompositePlayableRegion([prague, centralBohemia]);
  const overlayModel = buildMapOverlayModel({
    previewRegion: composite
  });
  const playableBoundaryOverlay = overlayModel.overlays.find((overlay) => overlay.overlayId === 'preview-boundary');
  const polygonPaths = geometryToSvgPolygonPaths(playableBoundaryOverlay?.geometry, getGeometryBounds(playableBoundaryOverlay?.geometry), {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(composite?.compositeMetadata?.componentRegions.length, 2);
  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.deepEqual(composite?.geometry, composite?.compositeMetadata?.rawCombinedGeometry);
  assert.equal(Boolean(playableBoundaryOverlay?.strokeGeometry), false);
  assert.equal(playableBoundaryOverlay?.suppressStroke, undefined);
  assert.equal(polygonPaths.length, 2);
});

test('provider-backed Prague plus Czechia keeps both exact component boundaries in the stable raw preview', () => {
  const prague = asProviderRegion(seedPlayableRegions[0]!, { regionId: 'osm:relation:prague' });
  const czechia: PlayableRegionCatalogEntry = asProviderRegion({
    regionId: 'seed-czechia',
    displayName: 'Czechia',
    regionKind: 'admin_region',
    summary: 'Country-scale enclosing region for provider-backed composite tests.',
    featureDatasetRefs: ['osm-admin'],
    sourceKind: 'seed_catalog',
    sourceLabel: 'Bundled seed region catalog',
    searchAliases: ['Czech Republic', 'Cesko'],
    countryLabel: 'Czechia',
    parentRegionLabel: 'Czechia',
    geometry: {
      type: 'Polygon',
      coordinates: [[[12.0, 48.5], [19.0, 48.5], [19.0, 51.5], [12.0, 51.5], [12.0, 48.5]]]
    }
  }, {
    regionId: 'osm:relation:czechia'
  });

  const composite = buildCompositePlayableRegion([prague, czechia]);
  const overlayModel = buildMapOverlayModel({
    previewRegion: composite
  });
  const playableBoundaryOverlay = overlayModel.overlays.find((overlay) => overlay.overlayId === 'preview-boundary');
  const polygonPaths = geometryToSvgPolygonPaths(playableBoundaryOverlay?.geometry, getGeometryBounds(playableBoundaryOverlay?.geometry), {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(composite?.compositeMetadata?.componentRegions.length, 2);
  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.deepEqual(composite?.geometry, composite?.compositeMetadata?.rawCombinedGeometry);
  assert.equal(Boolean(playableBoundaryOverlay?.strokeGeometry), false);
  assert.equal(polygonPaths.length, 2);
});

test('composite region builder always uses the stable raw combined geometry for shared-border selections', () => {
  const westRegion: PlayableRegionCatalogEntry = {
    regionId: 'provider:west-fallback',
    displayName: 'West Region',
    regionKind: 'admin_region',
    summary: 'West test region',
    featureDatasetRefs: ['osm-admin'],
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
    },
    sourceKind: 'provider_catalog',
    sourceLabel: 'OpenStreetMap Nominatim',
    searchAliases: ['West Region'],
    providerMetadata: {
      providerKey: 'osm_nominatim',
      providerLabel: 'OpenStreetMap Nominatim',
      boundarySource: 'search_geometry'
    }
  };
  const eastRegion: PlayableRegionCatalogEntry = {
    ...westRegion,
    regionId: 'provider:east-fallback',
    displayName: 'East Region',
    summary: 'East test region',
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]
    },
    searchAliases: ['East Region']
  };

  const composite = buildCompositePlayableRegion([westRegion, eastRegion]);

  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.match(composite?.compositeMetadata?.dissolveNotice ?? '', /raw component boundaries/i);
  assert.deepEqual(composite?.geometry, composite?.compositeMetadata?.rawCombinedGeometry);
  assert.equal(composite?.geometry.type, 'MultiPolygon');

  const overlayModel = buildMapOverlayModel({
    previewRegion: composite
  });
  const playableBoundaryOverlay = overlayModel.overlays.find((overlay) => overlay.overlayId === 'preview-boundary');
  const polygonPaths = geometryToSvgPolygonPaths(playableBoundaryOverlay?.geometry, getGeometryBounds(playableBoundaryOverlay?.geometry), {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(Boolean(playableBoundaryOverlay?.strokeGeometry), false);
  assert.equal(playableBoundaryOverlay?.suppressStroke, undefined);
  assert.equal(polygonPaths.length, 2);
});

test('shared-border composite selections keep every region visible in the stable raw preview', () => {
  const westRegion: PlayableRegionCatalogEntry = {
    regionId: 'provider:west',
    displayName: 'West Region',
    regionKind: 'admin_region',
    summary: 'West test region',
    featureDatasetRefs: ['osm-admin'],
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
    },
    sourceKind: 'provider_catalog',
    sourceLabel: 'OpenStreetMap Nominatim',
    searchAliases: ['West Region'],
    providerMetadata: {
      providerKey: 'osm_nominatim',
      providerLabel: 'OpenStreetMap Nominatim',
      boundarySource: 'search_geometry'
    }
  };
  const eastRegion: PlayableRegionCatalogEntry = {
    ...westRegion,
    regionId: 'provider:east',
    displayName: 'East Region',
    summary: 'East test region',
    geometry: {
      type: 'Polygon',
      coordinates: [[[1, 0], [2, 0], [2, 1], [1, 1], [1, 0]]]
    },
    searchAliases: ['East Region']
  };

  const composite = buildCompositePlayableRegion([westRegion, eastRegion]);

  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.deepEqual(composite?.geometry, composite?.compositeMetadata?.rawCombinedGeometry);
});

test('disconnected composite selections keep separate regions visible in the stable raw preview', () => {
  const prague = seedPlayableRegions[0]!;
  const vienna = seedPlayableRegions[2]!;
  const composite = buildCompositePlayableRegion([prague, vienna]);
  const overlayModel = buildMapOverlayModel({
    previewRegion: composite
  });
  const playableBoundaryOverlay = overlayModel.overlays.find((overlay) => overlay.overlayId === 'preview-boundary');
  const polygonPaths = geometryToSvgPolygonPaths(playableBoundaryOverlay?.geometry, getGeometryBounds(playableBoundaryOverlay?.geometry), {
    width: 360,
    height: 260,
    padding: 16
  });

  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(Boolean(composite?.compositeMetadata?.disconnectedWarning), true);
  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.equal(polygonPaths.length, 2);
});

test('composite region builder preserves multipolygon inputs in the combined geometry', () => {
  const islandRegion: PlayableRegionCatalogEntry = {
    regionId: 'provider:islands',
    displayName: 'Island Group',
    regionKind: 'admin_region',
    summary: 'Two-island admin region',
    featureDatasetRefs: ['osm-admin'],
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[14.1, 50.1], [14.2, 50.1], [14.2, 50.2], [14.1, 50.2], [14.1, 50.1]]],
        [[[14.4, 50.4], [14.5, 50.4], [14.5, 50.5], [14.4, 50.5], [14.4, 50.4]]]
      ]
    },
    sourceKind: 'provider_catalog',
    sourceLabel: 'OpenStreetMap Nominatim',
    searchAliases: ['Island Group'],
    providerMetadata: {
      providerKey: 'osm_nominatim',
      providerLabel: 'OpenStreetMap Nominatim',
      boundarySource: 'search_geometry'
    }
  };
  const prague = seedPlayableRegions[0]!;

  const composite = buildCompositePlayableRegion([islandRegion, prague]);

  assert.equal(composite?.geometry.type, 'MultiPolygon');
  assert.equal(composite?.compositeMetadata?.dissolveStatus, 'disabled_stable_raw');
  assert.equal(Array.isArray(composite?.geometry.coordinates), true);
  assert.equal((composite?.geometry.coordinates as unknown[])?.length, 3);
  assert.equal(Array.isArray(composite?.compositeMetadata?.rawCombinedGeometry.coordinates), true);
  assert.equal((composite?.compositeMetadata?.rawCombinedGeometry.coordinates as unknown[])?.length, 3);
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

test('nominatim provider deduplicates in-flight identical searches while keeping cache behavior', async () => {
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
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new Response(JSON.stringify([
        {
          place_id: 1,
          osm_type: 'relation',
          osm_id: 438840,
          class: 'boundary',
          type: 'administrative',
          display_name: 'Prague, Czechia',
          address: {
            city: 'Prague',
            country: 'Czechia'
          },
          geojson: pragueBoundary
        }
      ]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      });
    }
  });

  const [firstResult, secondResult] = await Promise.all([
    provider.searchRegions('Prague'),
    provider.searchRegions('Prague')
  ]);

  assert.equal(fetchCalls, 1);
  assert.deepEqual(firstResult, secondResult);
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
  assert.equal(response.attribution?.label, 'Bundled seed region catalog');
});

test('provider-backed data source exposes live-provider attribution without changing the search API', async () => {
  const providerBoundary: GeoJsonGeometryModel = {
    type: 'Polygon',
    coordinates: [[[14.3, 50.0], [14.8, 50.0], [14.8, 50.4], [14.3, 50.4], [14.3, 50.0]]]
  };
  const dataSource = createProviderBackedRegionDataSource({
    provider: createNominatimRegionProvider({
      baseUrl: mobileAppEnvironment.regionProviderBaseUrl,
      providerLabel: 'Development Nominatim',
      providerAttributionUrl: 'https://nominatim.example.test',
      usageMode: 'proxy_backend_recommended',
      throttleMs: 0,
      cacheTtlMs: 60_000,
      fetchFn: async () => new Response(JSON.stringify([
        {
          place_id: 1,
          osm_type: 'relation',
          osm_id: 438840,
          class: 'boundary',
          type: 'administrative',
          display_name: 'Prague, Czechia',
          address: {
            city: 'Prague',
            country: 'Czechia'
          },
          geojson: providerBoundary
        }
      ]), {
        status: 200,
        headers: {
          'Content-Type': 'application/json'
        }
      })
    }),
    fallback: createSeedRegionDataSource(seedPlayableRegions)
  });

  const response = await dataSource.searchRegions('Prague');

  assert.equal(response.usingFallback, false);
  assert.equal(response.sourceLabel, 'Development Nominatim');
  assert.equal(response.attribution?.label, 'Development Nominatim');
  assert.equal(response.attribution?.usageMode, 'proxy_backend_recommended');
  assert.equal(response.attribution?.url, 'https://nominatim.example.test');
});

test('provider-backed data source falls back gracefully on rate limiting with a retryable notice', async () => {
  const dataSource = createProviderBackedRegionDataSource({
    provider: {
      providerKey: 'osm_nominatim',
      providerLabel: 'OpenStreetMap Nominatim',
      attribution: {
        providerKey: 'osm_nominatim',
        label: 'OpenStreetMap Nominatim',
        notice: 'Direct public Nominatim access is suitable for local or low-volume development only. Use a backend or proxy in production.',
        usageMode: 'direct_public_dev_only',
        url: 'https://nominatim.openstreetmap.org'
      },
      async searchRegions() {
        throw new RegionProviderRateLimitError('Too many requests');
      },
      async getRegionById() {
        return undefined;
      }
    },
    fallback: createSeedRegionDataSource(seedPlayableRegions)
  });

  const response = await dataSource.searchRegions('Praha');

  assert.equal(response.usingFallback, true);
  assert.equal(response.attribution?.usageMode, 'bundled_fallback');
  assert.match(response.noticeMessage ?? '', /rate limiting/i);
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

test('composite playable regions apply through create_map_region into the bounded match state', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-composite',
    authUserId: 'auth-host-composite'
  };
  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-composite-map-flow',
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

  const compositeRegion = buildCompositePlayableRegion([
    seedPlayableRegions[0]!,
    seedPlayableRegions[1]!
  ]);
  assert.ok(compositeRegion);

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
        regionId: compositeRegion.regionId,
        displayName: compositeRegion.displayName,
        regionKind: compositeRegion.regionKind,
        featureDatasetRefs: compositeRegion.featureDatasetRefs,
        geometry: compositeRegion.geometry
      }
    }]
  );

  assert.equal(applied.projectionDelivery.projection.visibleMap?.regionId, compositeRegion.regionId);
  assert.deepEqual(
    applied.projectionDelivery.projection.visibleMap?.playableBoundary.geometry,
    compositeRegion.geometry
  );
  assert.deepEqual(
    applied.projectionDelivery.projection.visibleMap?.remainingArea?.geometry,
    compositeRegion.geometry
  );

  await orchestrator.disconnect(created.connection);
});
