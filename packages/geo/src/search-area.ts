import type {
  ConstraintExplanationModel,
  ConstraintHistoryEntryModel,
  ConstraintRecordModel,
  ContradictionReportModel,
  CreateMapRegionCommand,
  FeatureClassRef,
  GeoJsonGeometryModel,
  GeometryPrecision,
  PlayableRegionModel,
  SearchAreaModel,
  SpatialArtifactKind,
  SpatialArtifactModel
} from '../../shared-types/src/index.ts';

export interface ResolvedConstraintDraft {
  resolutionMode: GeometryPrecision;
  confidenceScore: number;
  featureCoverage: GeometryPrecision;
  explanation: ConstraintExplanationModel;
  nextRemainingGeometry?: GeoJsonGeometryModel;
  eliminatedGeometry?: GeoJsonGeometryModel;
  overlayGeometries?: GeoJsonGeometryModel[];
  featureClassRefs?: FeatureClassRef[];
  contradictionReason?: string;
  metadata?: Record<string, unknown>;
}

function artifactId(
  regionId: string,
  kind: SpatialArtifactKind,
  createdAt: string,
  suffix: string
): string {
  return `${regionId}:${kind}:${createdAt}:${suffix}`;
}

export function confidenceScoreForPrecision(precision: GeometryPrecision): number {
  if (precision === 'exact') {
    return 0.95;
  }

  if (precision === 'approximate') {
    return 0.65;
  }

  return 0.2;
}

function createSpatialArtifact(args: {
  regionId: string;
  kind: SpatialArtifactKind;
  createdAt: string;
  precision: GeometryPrecision;
  confidenceScore: number;
  featureCoverage: GeometryPrecision;
  geometry?: GeoJsonGeometryModel;
  explanation?: string;
  featureClassRefs?: FeatureClassRef[];
  metadata?: Record<string, unknown>;
  suffix: string;
}): SpatialArtifactModel {
  return {
    artifactId: artifactId(args.regionId, args.kind, args.createdAt, args.suffix),
    kind: args.kind,
    regionId: args.regionId,
    geometry: args.geometry,
    precision: args.precision,
    confidenceScore: args.confidenceScore,
    clippedToRegion: true,
    featureCoverage: args.featureCoverage,
    explanation: args.explanation,
    featureClassRefs: args.featureClassRefs,
    metadata: args.metadata ?? {},
    createdAt: args.createdAt
  };
}

function contradictionReport(
  createdAt: string,
  reason: string,
  currentHistory: ConstraintHistoryEntryModel[]
): ContradictionReportModel {
  return {
    contradictionId: `contradiction:${createdAt}`,
    reason,
    conflictingConstraintRecordIds: currentHistory.map((entry) => entry.constraintRecordId),
    detectedAt: createdAt
  };
}

export function emptyGeometry(): GeoJsonGeometryModel {
  return {
    type: 'MultiPolygon',
    coordinates: []
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
    confidenceScore: 1,
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
      confidenceScore: 1,
      featureCoverage: 'exact',
      geometry: region.boundaryGeometry,
      explanation: `Initial candidate area matches the selected ${region.regionKind} boundary.`,
      metadata: {
        source: 'region_boundary'
      },
      suffix: 'initial-remaining'
    }),
    eliminatedAreas: [],
    constraintArtifacts: [],
    history: []
  };
}

export function metadataOnlyDraft(args: {
  summary: string;
  detail?: string;
  reasoningSteps?: string[];
  metadata?: Record<string, unknown>;
}): ResolvedConstraintDraft {
  return {
    resolutionMode: 'metadata_only',
    confidenceScore: confidenceScoreForPrecision('metadata_only'),
    featureCoverage: 'metadata_only',
    explanation: {
      summary: args.summary,
      detail: args.detail,
      reasoningSteps: args.reasoningSteps ?? []
    },
    metadata: args.metadata
  };
}

export function materializeConstraintRecord(args: {
  searchArea: SearchAreaModel;
  region: PlayableRegionModel;
  constraintRecordId: string;
  constraintId: string;
  sourceQuestionInstanceId?: string;
  sourceCardInstanceId?: string;
  createdAt: string;
  draft: ResolvedConstraintDraft;
  rawMetadata?: Record<string, unknown>;
}): ConstraintRecordModel {
  const artifacts: SpatialArtifactModel[] = [];
  const beforeRemainingArtifactId = args.searchArea.remainingArea.artifactId;
  let afterRemainingArtifactId = beforeRemainingArtifactId;

  const contradiction =
    args.draft.contradictionReason
      ? contradictionReport(args.createdAt, args.draft.contradictionReason, args.searchArea.history)
      : undefined;

  if (args.draft.nextRemainingGeometry || contradiction) {
    const remainingArtifact = createSpatialArtifact({
      regionId: args.region.regionId,
      kind: 'candidate_remaining',
      createdAt: args.createdAt,
      precision: args.draft.resolutionMode,
      confidenceScore: args.draft.confidenceScore,
      featureCoverage: args.draft.featureCoverage,
      geometry: args.draft.nextRemainingGeometry ?? emptyGeometry(),
      explanation: args.draft.explanation.summary,
      featureClassRefs: args.draft.featureClassRefs,
      metadata: {
        constraintRecordId: args.constraintRecordId,
        source: 'constraint_result',
        ...(args.draft.metadata ?? {})
      },
      suffix: 'remaining'
    });
    artifacts.push(remainingArtifact);
    afterRemainingArtifactId = remainingArtifact.artifactId;
  }

  if (args.draft.eliminatedGeometry) {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'candidate_eliminated',
        createdAt: args.createdAt,
        precision: args.draft.resolutionMode,
        confidenceScore: args.draft.confidenceScore,
        featureCoverage: args.draft.featureCoverage,
        geometry: args.draft.eliminatedGeometry,
        explanation: args.draft.explanation.summary,
        featureClassRefs: args.draft.featureClassRefs,
        metadata: {
          constraintRecordId: args.constraintRecordId,
          source: 'constraint_result',
          ...(args.draft.metadata ?? {})
        },
        suffix: 'eliminated'
      })
    );
  }

  for (const [index, geometry] of (args.draft.overlayGeometries ?? []).entries()) {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'constraint_overlay',
        createdAt: args.createdAt,
        precision: args.draft.resolutionMode,
        confidenceScore: args.draft.confidenceScore,
        featureCoverage: args.draft.featureCoverage,
        geometry,
        explanation: args.draft.explanation.summary,
        featureClassRefs: args.draft.featureClassRefs,
        metadata: {
          constraintRecordId: args.constraintRecordId,
          source: 'constraint_result',
          overlayIndex: index,
          ...(args.draft.metadata ?? {})
        },
        suffix: `overlay-${index + 1}`
      })
    );
  }

  if (artifacts.length === 0 && args.draft.resolutionMode === 'metadata_only') {
    artifacts.push(
      createSpatialArtifact({
        regionId: args.region.regionId,
        kind: 'constraint_overlay',
        createdAt: args.createdAt,
        precision: 'metadata_only',
        confidenceScore: args.draft.confidenceScore,
        featureCoverage: args.draft.featureCoverage,
        explanation: args.draft.explanation.summary,
        featureClassRefs: args.draft.featureClassRefs,
        metadata: {
          constraintRecordId: args.constraintRecordId,
          source: 'constraint_result',
          ...(args.draft.metadata ?? {})
        },
        suffix: 'metadata-only'
      })
    );
  }

  return {
    constraintRecordId: args.constraintRecordId,
    constraintId: args.constraintId,
    status: 'active',
    sourceQuestionInstanceId: args.sourceQuestionInstanceId,
    sourceCardInstanceId: args.sourceCardInstanceId,
    resolutionMode: args.draft.resolutionMode,
    confidenceScore: args.draft.confidenceScore,
    explanation: args.draft.explanation,
    beforeRemainingArtifactId,
    afterRemainingArtifactId,
    contradiction,
    artifacts,
    metadata: {
      ...(args.rawMetadata ?? {}),
      ...(args.draft.metadata ?? {})
    },
    createdAt: args.createdAt
  };
}

export function applyConstraintRecordToSearchArea(
  searchArea: SearchAreaModel,
  constraint: ConstraintRecordModel,
  occurredAt: string
): SearchAreaModel {
  let remainingArea = searchArea.remainingArea;
  const eliminatedAreas = [...searchArea.eliminatedAreas];
  const constraintArtifacts = [...searchArea.constraintArtifacts];

  for (const artifact of constraint.artifacts) {
    constraintArtifacts.push(artifact);

    if (
      artifact.kind === 'candidate_remaining' &&
      constraint.afterRemainingArtifactId === artifact.artifactId
    ) {
      remainingArea = artifact;
    }

    if (artifact.kind === 'candidate_eliminated') {
      eliminatedAreas.push(artifact);
    }
  }

  const historyEntry: ConstraintHistoryEntryModel = {
    historyEntryId: `history:${constraint.constraintRecordId}`,
    constraintRecordId: constraint.constraintRecordId,
    beforeRemainingArtifactId: constraint.beforeRemainingArtifactId,
    afterRemainingArtifactId: constraint.afterRemainingArtifactId,
    eliminatedArtifactIds: constraint.artifacts
      .filter((artifact) => artifact.kind === 'candidate_eliminated')
      .map((artifact) => artifact.artifactId),
    createdAt: occurredAt,
    summary: constraint.explanation.summary,
    contradiction: constraint.contradiction
  };

  return {
    ...searchArea,
    remainingArea,
    eliminatedAreas,
    constraintArtifacts,
    history: [...searchArea.history, historyEntry],
    contradiction: constraint.contradiction,
    lastUpdatedAt: occurredAt
  };
}
