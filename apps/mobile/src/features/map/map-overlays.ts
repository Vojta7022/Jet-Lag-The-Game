import type {
  GeoJsonGeometryModel,
  RoundStartLocationModel,
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';
import type { MapScenarioCustomOverlay } from './map-scenarios.ts';
import { buildHidingZoneCircle, getHidingRadiusMeters, type TransitStationCandidate } from './station-layer.ts';

export interface MapOverlayDescriptor {
  overlayId: string;
  label: string;
  geometry?: GeoJsonGeometryModel;
  strokeGeometry?: GeoJsonGeometryModel;
  renderMode?: 'fill' | 'line' | 'point';
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashed?: boolean;
  pointRadius?: number;
  suppressStroke?: boolean;
}

export interface MapOverlayModel {
  overlays: MapOverlayDescriptor[];
  legend: Array<{ label: string; color: string }>;
}

export function buildMapOverlayModel(args: {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  roundStartLocation?: RoundStartLocationModel;
  previewRegion?: PlayableRegionCatalogEntry;
  transitStations?: TransitStationCandidate[];
  selectedStation?: TransitStationCandidate;
  hidingRadiusMeters?: number;
  customOverlays?: MapScenarioCustomOverlay[];
}): MapOverlayModel {
  const overlays: MapOverlayDescriptor[] = [];
  const layerPolicies = args.visibleMap?.layerPolicies;
  const isLayerEnabled = (key: string) => layerPolicies?.[key] !== false;
  const showPlayableBoundary = isLayerEnabled('showPlayableBoundary');
  const showTransitStations = isLayerEnabled('showTransitStations');
  const showQuestionConstraints = isLayerEnabled('showQuestionConstraints');

  if (showPlayableBoundary && args.visibleMap?.playableBoundary.geometry) {
    overlays.push({
      overlayId: 'playable-boundary',
      label: 'Playable Region',
      geometry: args.visibleMap.playableBoundary.geometry,
      renderMode: 'fill',
      fill: 'rgba(20, 94, 168, 0.08)',
      stroke: '#145ea8',
      strokeWidth: 2,
      opacity: 1
    });
  } else if (showPlayableBoundary && args.previewRegion?.geometry) {
    overlays.push({
      overlayId: 'preview-boundary',
      label: args.previewRegion.sourceKind === 'composite_selection' ? 'Composite Boundary' : 'Selected Boundary',
      geometry: args.previewRegion.geometry,
      renderMode: 'fill',
      fill: 'rgba(20, 94, 168, 0.08)',
      stroke: '#145ea8',
      strokeWidth: 2,
      opacity: 1
    });
  }

  if (showQuestionConstraints && args.visibleMap?.remainingArea?.geometry) {
    overlays.push({
      overlayId: 'candidate-region',
      label: 'Candidate Region',
      geometry: args.visibleMap.remainingArea.geometry,
      renderMode: 'fill',
      fill: 'rgba(45, 122, 82, 0.25)',
      stroke: '#2d7a52',
      strokeWidth: 1.5,
      opacity: 1
    });
  } else if (showQuestionConstraints && args.previewRegion?.geometry) {
    overlays.push({
      overlayId: 'candidate-preview',
      label: args.previewRegion.sourceKind === 'composite_selection' ? 'Composite Candidate Preview' : 'Candidate Preview',
      geometry: args.previewRegion.geometry,
      renderMode: 'fill',
      fill: 'rgba(45, 122, 82, 0.18)',
      stroke: '#2d7a52',
      strokeWidth: 1.5,
      opacity: 1
    });
  }

  for (const artifact of showQuestionConstraints ? args.visibleMap?.eliminatedAreas ?? [] : []) {
    overlays.push({
      overlayId: artifact.artifactId,
      label: 'Eliminated Area',
      geometry: artifact.geometry,
      renderMode: 'fill',
      fill: 'rgba(178, 58, 58, 0.22)',
      stroke: '#b23a3a',
      strokeWidth: 1.25,
      opacity: 1
    });
  }

  for (const artifact of showQuestionConstraints ? args.visibleMap?.constraintArtifacts ?? [] : []) {
    overlays.push({
      overlayId: artifact.artifactId,
      label: 'Constraint Layer',
      geometry: artifact.geometry,
      renderMode: 'fill',
      fill: 'rgba(153, 99, 0, 0.14)',
      stroke: '#996300',
      strokeWidth: 1.25,
      opacity: 1,
      dashed: true
    });
  }

  if (
    args.previewRegion?.geometry &&
    args.visibleMap?.regionId &&
    args.previewRegion.regionId !== args.visibleMap.regionId
  ) {
    overlays.push({
      overlayId: `selection-preview:${args.previewRegion.regionId}`,
      label: 'Preview Selection',
      geometry: args.previewRegion.geometry,
      renderMode: 'fill',
      fill: 'rgba(19, 33, 47, 0.02)',
      stroke: '#13212f',
      strokeWidth: 1.5,
      opacity: 1,
      dashed: true
    });
  }

  for (const track of args.visibleMovementTracks ?? []) {
    const samples = track.samples;
    if (samples.length >= 2) {
      overlays.push({
        overlayId: `movement:${track.playerId}:trail`,
        label: 'Movement Breadcrumb',
        geometry: {
          type: 'LineString',
          coordinates: samples.map((sample) => [sample.longitude, sample.latitude])
        },
        renderMode: 'line',
        fill: 'none',
        stroke: '#7a4b00',
        strokeWidth: 2,
        opacity: 1
      });
    }

    if (track.latestSample) {
      overlays.push({
        overlayId: `movement:${track.playerId}:latest`,
        label: 'Visible Position',
        geometry: {
          type: 'Point',
          coordinates: [track.latestSample.longitude, track.latestSample.latitude]
        },
        renderMode: 'point',
        fill: '#7a4b00',
        stroke: '#13212f',
        strokeWidth: 1.5,
        opacity: 1,
        pointRadius: 4.5
      });
    }
  }

  if (args.roundStartLocation) {
    overlays.push({
      overlayId: 'round-start-location',
      label: 'Last Round Start',
      geometry: {
        type: 'Point',
        coordinates: [args.roundStartLocation.longitude, args.roundStartLocation.latitude]
      },
      renderMode: 'point',
      fill: '#ef702f',
      stroke: '#ffffff',
      strokeWidth: 2,
      opacity: 1,
      pointRadius: 7
    });
  }

  if (showTransitStations && args.transitStations?.length) {
    overlays.push({
      overlayId: 'transit-stations',
      label: 'Transit Stations',
      geometry: {
        type: 'MultiPoint',
        coordinates: args.transitStations.map((station) => [station.longitude, station.latitude])
      },
      renderMode: 'point',
      fill: '#f2bd43',
      stroke: '#263b55',
      strokeWidth: 1.5,
      opacity: 1,
      pointRadius: 5
    });
  }

  if (args.selectedStation) {
    const radius = args.hidingRadiusMeters ?? getHidingRadiusMeters('small');
    overlays.push({
      overlayId: 'selected-hiding-zone',
      label: `Hiding Zone · ${radius} m`,
      geometry: buildHidingZoneCircle(args.selectedStation, radius),
      renderMode: 'fill',
      fill: 'rgba(242, 189, 67, 0.42)',
      stroke: '#e29a22',
      strokeWidth: 3,
      opacity: 1
    });
    overlays.push({
      overlayId: 'selected-station',
      label: args.selectedStation.name,
      geometry: {
        type: 'Point',
        coordinates: [args.selectedStation.longitude, args.selectedStation.latitude]
      },
      renderMode: 'point',
      fill: '#eb702e',
      stroke: '#ffffff',
      strokeWidth: 2,
      opacity: 1,
      pointRadius: 7
    });
  }

  for (const layer of args.customOverlays ?? []) {
    if (!layer.visible) continue;
    const geometryType = layer.geometry.type;
    const renderMode = geometryType === 'Point' || geometryType === 'MultiPoint'
      ? 'point'
      : geometryType === 'LineString' || geometryType === 'MultiLineString'
        ? 'line'
        : 'fill';
    overlays.push({
      overlayId: `custom:${layer.id}`,
      label: layer.name,
      geometry: layer.geometry,
      renderMode,
      fill: `rgba(${Number.parseInt(layer.color.slice(1, 3), 16)}, ${Number.parseInt(layer.color.slice(3, 5), 16)}, ${Number.parseInt(layer.color.slice(5, 7), 16)}, 0.3)`,
      stroke: layer.color,
      strokeWidth: 2,
      opacity: 1,
      pointRadius: 5
    });
  }

  return {
    overlays,
    legend: [
      ...(showPlayableBoundary ? [{ label: 'Playable Region', color: '#145ea8' }] : []),
      ...(showQuestionConstraints ? [
        { label: 'Candidate Region', color: '#2d7a52' },
        { label: 'Eliminated Area', color: '#b23a3a' },
        { label: 'Constraint Layer', color: '#996300' }
      ] : []),
      { label: 'Movement Breadcrumb', color: '#7a4b00' },
      { label: 'Visible Position', color: '#7a4b00' },
      { label: 'Last Round Start', color: '#ef702f' },
      ...(showTransitStations ? [{ label: 'Transit Stations', color: '#f2bd43' }] : []),
      { label: 'Selected Hiding Zone', color: '#e29a22' },
      ...(args.customOverlays ?? []).filter((layer) => layer.visible).map((layer) => ({ label: layer.name, color: layer.color }))
    ]
  };
}
