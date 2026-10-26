import type {
  DomainCommand,
  GeoJsonGeometryModel,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { getGeometryBounds } from '../map/map-geometry.ts';
import { buildMapSetupBootstrapCommands } from '../map/map-setup-flow.ts';
import { getSeedPlayableRegion, seedPlayableRegions } from '../map/seed-regions.ts';
import { representativePointFromGeometry } from '../../../../../packages/geo/src/index.ts';

function getAnchorPoint(geometry: GeoJsonGeometryModel | undefined): { latitude: number; longitude: number } | undefined {
  const point = representativePointFromGeometry(geometry);
  if (!point) {
    return undefined;
  }

  return {
    latitude: point[1],
    longitude: point[0]
  };
}

function buildMovementPoints(geometry: GeoJsonGeometryModel | undefined) {
  const bounds = getGeometryBounds(geometry);
  if (!bounds) {
    return [];
  }

  const latitude = (bounds.minLatitude + bounds.maxLatitude) / 2;
  const longitude = (bounds.minLongitude + bounds.maxLongitude) / 2;
  const longitudeStep = Math.max((bounds.maxLongitude - bounds.minLongitude) * 0.08, 0.01);

  return [
    {
      latitude,
      longitude: longitude - longitudeStep
    },
    {
      latitude,
      longitude: longitude + longitudeStep
    }
  ];
}

export function buildQuestionFlowBootstrapCommands(
  projection: MatchProjection,
  options: { preferredRegionId?: string; mode?: 'standard' | 'demo'; bridgeAvailability?: 'present' | 'none'; rulesetId?: string } = {}
): DomainCommand[] {
  if (
    projection.lifecycleState === 'seek_phase' ||
    projection.lifecycleState === 'endgame' ||
    projection.lifecycleState === 'game_complete' ||
    projection.lifecycleState === 'archived'
  ) {
    return [];
  }

  const commands: DomainCommand[] = [...buildMapSetupBootstrapCommands(projection, options.rulesetId)];
  const preferredRegionId = options.preferredRegionId ?? seedPlayableRegions[0]?.regionId;
  const demoMode = options.mode === 'demo';
  const bridgeAvailability = options.bridgeAvailability ?? projection.visibleMap?.bridgeAvailability ?? (demoMode ? 'present' : 'unknown');
  const selectedRegion = getSeedPlayableRegion(projection.visibleMap?.regionId ?? preferredRegionId ?? '');
  const selectedGeometry = projection.visibleMap?.playableBoundary.geometry ?? selectedRegion?.geometry;
  const anchorPoint = getAnchorPoint(selectedGeometry);
  const needsMapRegion =
    !projection.visibleMap &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(projection.lifecycleState);

  if (needsMapRegion && selectedRegion) {
    commands.push({
      type: 'create_map_region',
      payload: {
        regionId: selectedRegion.regionId,
        displayName: selectedRegion.displayName,
        regionKind: selectedRegion.regionKind,
        featureDatasetRefs: selectedRegion.featureDatasetRefs,
        geometry: selectedRegion.geometry,
        bridgeAvailability
      }
    });
  }

  if (
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(projection.lifecycleState)
    && bridgeAvailability !== 'unknown'
  ) {
    commands.push({
      type: 'start_match',
      payload: {}
    });
  }

  if (demoMode &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup', 'hide_phase'].includes(projection.lifecycleState) &&
    !projection.hiddenState?.hidingZone &&
    anchorPoint
  ) {
    commands.push({
      type: 'set_hiding_zone',
      payload: {
        stationId: `demo-station:${projection.visibleMap?.regionId ?? selectedRegion?.regionId ?? 'seed'}`,
        stationName: 'Example station (demo)',
        latitude: anchorPoint.latitude,
        longitude: anchorPoint.longitude
      }
    });
  }

  if (demoMode &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup', 'hide_phase'].includes(projection.lifecycleState) &&
    !projection.hiddenState?.hiderLocation &&
    anchorPoint
  ) {
    commands.push({
      type: 'lock_hider_location',
      payload: {
        latitude: anchorPoint.latitude,
        longitude: anchorPoint.longitude,
        accuracyMeters: 25
      }
    });
  }

  if (demoMode &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup', 'hide_phase'].includes(projection.lifecycleState)
  ) {
    commands.push({
      type: 'end_hide_phase',
      payload: {}
    });
  }

  return commands;
}

export function buildDemoMovementCommands(geometry: GeoJsonGeometryModel | undefined): DomainCommand[] {
  return buildMovementPoints(geometry).map((point) => ({
    type: 'update_location',
    payload: {
      latitude: point.latitude,
      longitude: point.longitude,
      accuracyMeters: 30,
      source: 'manual'
    }
  }));
}
