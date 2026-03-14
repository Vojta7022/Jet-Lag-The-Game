import type {
  ConstraintRecordModel,
  CreateMapRegionCommand,
  GeoJsonGeometryModel,
  GeometryPrecision,
  PlayableRegionModel,
  SearchAreaModel,
  SpatialArtifactKind,
  SpatialArtifactModel
} from '../../shared-types/src/index.ts';

export interface SpatialConstraintInput {
  mode?: 'preclipped' | 'metadata_only';
  regionId?: string;
  precision?: GeometryPrecision;
  featureCoverage?: GeometryPrecision;
  explanation?: string;
  remainingAreaGeometry?: GeoJsonGeometryModel;
  eliminatedAreaGeometries?: GeoJsonGeometryModel[];
  overlayGeometries?: GeoJsonGeometryModel[];
}

export interface ConstraintArtifactBuildResult {
  resolutionMode: GeometryPrecision;
  artifacts: SpatialArtifactModel[];
}

function normalizePrecision(
  value: unknown,
  fallback: GeometryPrecision
): GeometryPrecision {
  return value === 'exact' || value === 'approximate' || value === 'metadata_only'
    ? value
    : fallback;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function artifactId(
  regionId: string,
  kind: SpatialArtifactKind,
  createdAt: string,
  suffix: string
): string {
  return `${regionId}:${kind}:${createdAt}:${suffix}`;
}

function createSpatialArtifact(args: {
  regionId: string;
  kind: SpatialArtifactKind;
  createdAt: string;
  precision: GeometryPrecision;
  featureCoverage: GeometryPrecision;
  geometry?: GeoJsonGeometryModel;
  explanation?: string;
  metadata?: Record<string, unknown>;
  suffix: string;
}): SpatialArtifactModel {
  return {
    artifactId: artifactId(args.regionId, args.kind, args.createdAt, args.suffix),
    kind: args.kind,
    regionId: args.regionId,
    geometry: args.geometry,
    precision: args.precision,
    clippedToRegion: true,
    featureCoverage: args.featureCoverage,
    explanation: args.explanation,
    metadata: args.metadata ?? {},
    createdAt: args.createdAt
  };
}

function readSpatialConstraintInput(metadata: Record<string, unknown>): SpatialConstraintInput | undefined {
  return asRecord(metadata.spatial) as SpatialConstraintInput | undefined;
}

function metadataOnlyConstraintArtifacts(
  region: PlayableRegionModel,
  createdAt: string,
  metadata: Record<string, unknown>,
  constraintRecordId: string
): ConstraintArtifactBuildResult {
  return {
    resolutionMode: 'metadata_only',
    artifacts: [
      createSpatialArtifact({
        regionId: region.regionId,
        kind: 'constraint_overlay',
        createdAt,
        precision: 'metadata_only',
        featureCoverage: 'metadata_only',
        explanation:
          'Constraint recorded without a preclipped geometry result. Search remains bounded to the selected region.',
        metadata: {
          constraintRecordId,
          degradedReason: 'missing_preclipped_geometry',
          rawMetadata: metadata
        },
        suffix: constraintRecordId
      })
    ]
  };
}

export function isPolygonBoundaryGeometry(geometry: GeoJsonGeometryModel | undefined): boolean {
  if (!geometry?.type) {
    return false;
  }

  const normalizedType = geometry.type.toLowerCase();
  return normalizedType === 'polygon' || normalizedType === 'multipolygon';
}

export function buildPlayableRegionFromCommand(
  payload: CreateMapRegionCommand['payload'],
  occurredAt: string
): PlayableRegionModel {
  const displayName = payload.displayName?.trim() || payload.regionId;
  const regionKind = payload.regionKind ?? 'custom';

  const boundaryArtifact = createSpatialArtifact({
    regionId: payload.regionId,
    kind: 'playable_boundary',
    createdAt: occurredAt,
    precision: 'exact',
    featureCoverage: 'exact',
    geometry: payload.geometry,
    explanation: `Playable region boundary for ${displayName}.`,
    metadata: {
      regionKind,
      featureDatasetRefs: payload.featureDatasetRefs ?? []
    },
    suffix: 'boundary'
  });

  return {
    regionId: payload.regionId,
    displayName,
    regionKind,
    boundaryGeometry: payload.geometry,
    boundaryArtifact,
    featureDatasetRefs: payload.featureDatasetRefs ?? [],
    configuredAt: occurredAt
  };
}

export function initializeSearchAreaFromRegion(
  region: PlayableRegionModel,
  occurredAt: string
): SearchAreaModel {
  return {
    regionId: region.regionId,
    initializedAt: occurredAt,
    lastUpdatedAt: occurredAt,
    remainingArea: createSpatialArtifact({
      regionId: region.regionId,
      kind: 'candidate_remaining',
      createdAt: occurredAt,
      precision: 'exact',
      featureCoverage: 'exact',
      geometry: region.boundaryGeometry,
      explanation: `Initial candidate area matches the selected ${region.regionKind} boundary.`,
      metadata: {
        source: 'region_boundary'
      },
      suffix: 'initial-remaining'
    }),
    eliminatedAreas: [],
    constraintArtifacts: []
  };
}

export function buildConstraintArtifactsForRegion(args: {
  region: PlayableRegionModel;
  metadata?: Record<string, unknown>;
  createdAt: string;
  constraintRecordId: string;
}): ConstraintArtifactBuildResult {
  const metadata = args.metadata ?? {};
  const spatial = readSpatialConstraintInput(metadata);

  if (!spatial) {
    return metadataOnlyConstraintArtifacts(args.region, args.createdAt, metadata, args.constraintRecordId);
  }

  if (spatial.mode !== 'preclipped') {
    return metadataOnlyConstraintArtifacts(args.region, args.createdAt, metadata, args.constraintRecordId);
  }

  if (spatial.regionId && spatial.regionId !== args.region.regionId) {
    return metadataOnlyConstraintArtifacts(args.region, args.createdAt, metadata, args.constraintRecordId);
  }

  const precision = normalizePrecision(spatial.precision, 'approximate');
  const featureCoverage = normalizePrecision(spatial.featureCoverage, precision);
  const artifacts: SpatialArtifactModel[] = [];

  if (spatial.remainingAreaGeometry) {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'candidate_remaining',
        createdAt: args.createdAt,
        precision,
        featureCoverage,
        geometry: spatial.remainingAreaGeometry,
        explanation: spatial.explanation,
        metadata: {
          constraintRecordId: args.constraintRecordId
        },
        suffix: 'remaining'
      })
    );
  }

  for (const [index, geometry] of (spatial.eliminatedAreaGeometries ?? []).entries()) {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'candidate_eliminated',
        createdAt: args.createdAt,
        precision,
        featureCoverage,
        geometry,
        explanation: spatial.explanation,
        metadata: {
          constraintRecordId: args.constraintRecordId
        },
        suffix: `eliminated-${index + 1}`
      })
    );
  }

  for (const [index, geometry] of (spatial.overlayGeometries ?? []).entries()) {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'constraint_overlay',
        createdAt: args.createdAt,
        precision,
        featureCoverage,
        geometry,
        explanation: spatial.explanation,
        metadata: {
          constraintRecordId: args.constraintRecordId
        },
        suffix: `overlay-${index + 1}`
      })
    );
  }

  if (artifacts.length === 0) {
    return metadataOnlyConstraintArtifacts(args.region, args.createdAt, metadata, args.constraintRecordId);
  }

  return {
    resolutionMode: precision,
    artifacts
  };
}

export function applyConstraintArtifactsToSearchArea(
  searchArea: SearchAreaModel,
  constraint: ConstraintRecordModel,
  occurredAt: string
): SearchAreaModel {
  let remainingArea = searchArea.remainingArea;
  const eliminatedAreas = [...searchArea.eliminatedAreas];
  const constraintArtifacts = [...searchArea.constraintArtifacts];

  for (const artifact of constraint.artifacts) {
    constraintArtifacts.push(artifact);

    if (artifact.kind === 'candidate_remaining' && artifact.geometry) {
      remainingArea = artifact;
    }

    if (artifact.kind === 'candidate_eliminated') {
      eliminatedAreas.push(artifact);
    }
  }

  return {
    ...searchArea,
    remainingArea,
    eliminatedAreas,
    constraintArtifacts,
    lastUpdatedAt: occurredAt
  };
}
