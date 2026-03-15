import type {
  GeoJsonGeometryModel,
  VisibleMapProjection,
  VisibleMovementTrackProjection
} from '../../../../../packages/shared-types/src/index.ts';

import type { PlayableRegionCatalogEntry } from './region-types.ts';

export interface MapOverlayDescriptor {
  overlayId: string;
  label: string;
  geometry?: GeoJsonGeometryModel;
  renderMode?: 'fill' | 'line' | 'point';
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
  dashed?: boolean;
  pointRadius?: number;
}

export interface MapOverlayModel {
  overlays: MapOverlayDescriptor[];
  legend: Array<{ label: string; color: string }>;
}

export function buildMapOverlayModel(args: {
  visibleMap?: VisibleMapProjection;
  visibleMovementTracks?: VisibleMovementTrackProjection[];
  previewRegion?: PlayableRegionCatalogEntry;
}): MapOverlayModel {
  const overlays: MapOverlayDescriptor[] = [];

  if (args.visibleMap?.playableBoundary.geometry) {
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
  } else if (args.previewRegion?.geometry) {
    overlays.push({
      overlayId: 'preview-boundary',
      label: 'Selected Boundary',
      geometry: args.previewRegion.geometry,
      renderMode: 'fill',
      fill: 'rgba(20, 94, 168, 0.08)',
      stroke: '#145ea8',
      strokeWidth: 2,
      opacity: 1
    });
  }

  if (args.visibleMap?.remainingArea?.geometry) {
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
  } else if (args.previewRegion?.geometry) {
    overlays.push({
      overlayId: 'candidate-preview',
      label: 'Candidate Preview',
      geometry: args.previewRegion.geometry,
      renderMode: 'fill',
      fill: 'rgba(45, 122, 82, 0.18)',
      stroke: '#2d7a52',
      strokeWidth: 1.5,
      opacity: 1
    });
  }

  for (const artifact of args.visibleMap?.eliminatedAreas ?? []) {
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

  for (const artifact of args.visibleMap?.constraintArtifacts ?? []) {
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

  return {
    overlays,
    legend: [
      { label: 'Playable Region', color: '#145ea8' },
      { label: 'Candidate Region', color: '#2d7a52' },
      { label: 'Eliminated Area', color: '#b23a3a' },
      { label: 'Constraint Layer', color: '#996300' },
      { label: 'Movement Breadcrumb', color: '#7a4b00' },
      { label: 'Visible Position', color: '#7a4b00' }
    ]
  };
}
