import type {
  DomainCommand,
  GeoJsonGeometryModel,
  MatchProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { getGeometryBounds } from '../map/map-geometry.ts';
import { buildMapSetupBootstrapCommands } from '../map/map-setup-flow.ts';
import { getSeedPlayableRegion, seedPlayableRegions } from '../map/seed-regions.ts';

function getAnchorPoint(geometry: GeoJsonGeometryModel | undefined): { latitude: number; longitude: number } | undefined {
  const bounds = getGeometryBounds(geometry);
  if (!bounds) {
    return undefined;
  }

  return {
    latitude: (bounds.minLatitude + bounds.maxLatitude) / 2,
    longitude: (bounds.minLongitude + bounds.maxLongitude) / 2
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
  preferredRegionId = seedPlayableRegions[0]?.regionId
): DomainCommand[] {
  if (
    projection.lifecycleState === 'seek_phase' ||
    projection.lifecycleState === 'endgame' ||
    projection.lifecycleState === 'game_complete' ||
    projection.lifecycleState === 'archived'
  ) {
    return [];
  }

  const commands: DomainCommand[] = [...buildMapSetupBootstrapCommands(projection)];
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
        geometry: selectedRegion.geometry
      }
    });
  }

  if (
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(projection.lifecycleState)
  ) {
    commands.push({
      type: 'start_match',
      payload: {}
    });
  }

  if (
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

  if (
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
