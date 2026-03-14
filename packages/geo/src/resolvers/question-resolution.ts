import type {
  ConstraintDefinition,
  ContentPack,
  GeoJsonGeometryModel,
  GeometryPrecision,
  MatchAggregate,
  QuestionCategoryDefinition,
  QuestionInstanceModel,
  QuestionTemplateDefinition
} from '../../../shared-types/src/index.ts';

import type { GeoFeatureRecord } from '../feature-layer.ts';
import { queryClosestAmongCandidates, queryNearestFeature } from '../features/query.ts';
import { filterGeometryByGrid } from '../geometry/grid.ts';
import {
  geometryHasArea,
  representativePointFromGeometry,
  type LonLat
} from '../geometry/geojson.ts';
import {
  buildCirclePolygon,
  clipGeometryToConvexPolygon,
  relationHalfPlane
} from '../geometry/operations.ts';
import { distanceMeters } from '../geometry/planar.ts';
import {
  confidenceScoreForPrecision,
  emptyGeometry,
  metadataOnlyDraft,
  type ResolvedConstraintDraft
} from '../search-area.ts';

export interface QuestionConstraintResolutionContext {
  aggregate: MatchAggregate;
  contentPack: ContentPack;
  question: QuestionInstanceModel;
  category: QuestionCategoryDefinition;
  template: QuestionTemplateDefinition;
  constraint: ConstraintDefinition;
  createdAt: string;
  resolutionMetadata?: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function spatialOverrideDraft(metadata: Record<string, unknown> | undefined): ResolvedConstraintDraft | undefined {
  const spatial = asRecord(metadata?.spatial);
  if (!spatial) {
    return undefined;
  }

  if (spatial.mode === 'preclipped') {
    return {
      resolutionMode:
        spatial.precision === 'exact' || spatial.precision === 'approximate'
          ? spatial.precision
          : 'approximate',
      confidenceScore:
        typeof spatial.confidenceScore === 'number'
          ? spatial.confidenceScore
          : confidenceScoreForPrecision(
              spatial.precision === 'exact' || spatial.precision === 'approximate'
                ? spatial.precision
                : 'approximate'
            ),
      featureCoverage:
        spatial.featureCoverage === 'exact' ||
        spatial.featureCoverage === 'approximate' ||
        spatial.featureCoverage === 'metadata_only'
          ? spatial.featureCoverage
          : 'approximate',
      explanation: {
        summary:
          typeof spatial.explanation === 'string'
            ? spatial.explanation
            : 'A preclipped spatial override was applied.',
        reasoningSteps: ['Used a preclipped spatial override supplied by the authority.']
      },
      nextRemainingGeometry: spatial.remainingAreaGeometry as GeoJsonGeometryModel | undefined,
      eliminatedGeometry:
        Array.isArray(spatial.eliminatedAreaGeometries) && spatial.eliminatedAreaGeometries.length > 0
          ? (spatial.eliminatedAreaGeometries[0] as GeoJsonGeometryModel)
          : undefined,
      overlayGeometries: Array.isArray(spatial.overlayGeometries)
        ? (spatial.overlayGeometries as GeoJsonGeometryModel[])
        : undefined,
      metadata
    };
  }

  if (spatial.mode === 'metadata_only') {
    return metadataOnlyDraft({
      summary:
        typeof spatial.explanation === 'string'
          ? spatial.explanation
          : 'A metadata-only spatial override was recorded.',
      reasoningSteps: ['Used a metadata-only override supplied by the authority.'],
      metadata
    });
  }

  return undefined;
}

function answerValue(answer: Record<string, unknown> | undefined): string | undefined {
  if (!answer) {
    return undefined;
  }

  for (const key of ['value', 'selection', 'selectedFeatureId', 'featureId']) {
    if (typeof answer[key] === 'string') {
      return answer[key] as string;
    }
  }

  return undefined;
}

function featureAnswerId(answer: Record<string, unknown> | undefined): string | undefined {
  if (!answer) {
    return undefined;
  }

  const direct = typeof answer.selectedFeatureId === 'string'
    ? answer.selectedFeatureId
    : typeof answer.featureId === 'string'
      ? answer.featureId
      : undefined;

  if (direct) {
    return direct;
  }

  return typeof answer.value === 'string' ? answer.value : undefined;
}

function attachmentCount(answer: Record<string, unknown> | undefined): number {
  if (!answer) {
    return 0;
  }

  if (Array.isArray(answer.attachments)) {
    return answer.attachments.length;
  }

  if (Array.isArray(answer.attachmentIds)) {
    return answer.attachmentIds.length;
  }

  return 0;
}

function featureData(metadata: Record<string, unknown> | undefined): GeoFeatureRecord[] {
  if (!metadata || !Array.isArray(metadata.featureData)) {
    return [];
  }

  return metadata.featureData.filter(
    (feature): feature is GeoFeatureRecord =>
      Boolean(
        feature &&
          typeof feature === 'object' &&
          typeof (feature as GeoFeatureRecord).featureId === 'string' &&
          typeof (feature as GeoFeatureRecord).featureClassId === 'string'
      )
  );
}

function gridResolutionMeters(metadata: Record<string, unknown> | undefined): number {
  const value = metadata?.gridResolutionMeters;
  return typeof value === 'number' && value > 0 ? value : 1_000;
}

function featureClassIds(template: QuestionTemplateDefinition): string[] {
  return (template.featureClassRefs ?? []).map((feature) => feature.featureClassId);
}

function currentSearchGeometry(aggregate: MatchAggregate): GeoJsonGeometryModel | undefined {
  return aggregate.searchArea?.remainingArea.geometry ?? aggregate.mapRegion?.boundaryGeometry;
}

function latestPlayerLocation(aggregate: MatchAggregate, playerId: string | undefined): LonLat | undefined {
  if (!playerId) {
    return undefined;
  }

  const latest = [...aggregate.locationSamples]
    .filter((sample) => sample.playerId === playerId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .at(-1);

  return latest ? [latest.longitude, latest.latitude] : undefined;
}

function playerMovementHistory(aggregate: MatchAggregate, playerId: string | undefined): LonLat[] {
  if (!playerId) {
    return [];
  }

  return [...aggregate.locationSamples]
    .filter((sample) => sample.playerId === playerId)
    .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt))
    .map((sample) => [sample.longitude, sample.latitude] as LonLat);
}

function pointDistanceRelation(
  candidate: number,
  reference: number,
  relation: 'closer' | 'further' | 'same',
  toleranceMeters: number
): boolean {
  if (relation === 'same') {
    return Math.abs(candidate - reference) <= toleranceMeters;
  }

  if (relation === 'closer') {
    return candidate < reference - toleranceMeters;
  }

  return candidate > reference + toleranceMeters;
}

function approximateGridOutcome(args: {
  baseGeometry: GeoJsonGeometryModel;
  stepMeters: number;
  predicate: (point: LonLat) => boolean;
  summary: string;
  detail?: string;
  reasoningSteps: string[];
  featureCoverage?: GeometryPrecision;
  overlayGeometries?: GeoJsonGeometryModel[];
  metadata?: Record<string, unknown>;
}): ResolvedConstraintDraft {
  const filtered = filterGeometryByGrid({
    baseGeometry: args.baseGeometry,
    stepMeters: args.stepMeters,
    predicate: args.predicate
  });

  const contradictionReason =
    filtered.keptCount === 0
      ? 'Applying this constraint leaves no valid candidate area inside the selected playable region.'
      : undefined;

  return {
    resolutionMode: 'approximate',
    confidenceScore: 0.65,
    featureCoverage: args.featureCoverage ?? 'approximate',
    explanation: {
      summary: args.summary,
      detail: args.detail,
      reasoningSteps: args.reasoningSteps
    },
    nextRemainingGeometry: filtered.keptGeometry ?? emptyGeometry(),
    eliminatedGeometry: filtered.removedGeometry,
    overlayGeometries: args.overlayGeometries,
    contradictionReason,
    metadata: {
      keptCellCount: filtered.keptCount,
      removedCellCount: filtered.removedCount,
      ...(args.metadata ?? {})
    }
  };
}

function exactGeometryOutcome(args: {
  geometry: GeoJsonGeometryModel | undefined;
  summary: string;
  detail?: string;
  reasoningSteps: string[];
  featureCoverage?: GeometryPrecision;
  overlayGeometries?: GeoJsonGeometryModel[];
  metadata?: Record<string, unknown>;
}): ResolvedConstraintDraft {
  const contradictionReason =
    args.geometry && geometryHasArea(args.geometry)
      ? undefined
      : 'Applying this constraint leaves no valid candidate area inside the selected playable region.';

  return {
    resolutionMode: 'exact',
    confidenceScore: confidenceScoreForPrecision('exact'),
    featureCoverage: args.featureCoverage ?? 'exact',
    explanation: {
      summary: args.summary,
      detail: args.detail,
      reasoningSteps: args.reasoningSteps
    },
    nextRemainingGeometry: args.geometry ?? emptyGeometry(),
    overlayGeometries: args.overlayGeometries,
    contradictionReason,
    metadata: args.metadata
  };
}

function resolveRadar(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  seekerPoint: LonLat,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const threshold =
    typeof context.template.parameters?.distanceThreshold === 'object'
      ? (context.template.parameters.distanceThreshold as Record<string, unknown>).meters
      : context.template.resolverConfig.thresholdMeters;

  if (typeof threshold !== 'number' || threshold <= 0) {
    return metadataOnlyDraft({
      summary: 'Radar answer recorded without a usable distance threshold.',
      detail: 'The template did not provide a numeric radius.',
      reasoningSteps: ['No threshold could be resolved from the template.'],
      metadata
    });
  }

  const yesNoAnswer = answerValue(context.question.answer);
  if (yesNoAnswer !== 'yes' && yesNoAnswer !== 'no') {
    return metadataOnlyDraft({
      summary: 'Radar answer recorded without a recognized yes/no value.',
      reasoningSteps: ['Expected a yes/no answer for this Radar question.'],
      metadata
    });
  }

  const circle = buildCirclePolygon({
    center: seekerPoint,
    radiusMeters: threshold
  });

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) =>
      yesNoAnswer === 'yes'
        ? distanceMeters(point, seekerPoint) <= threshold
        : distanceMeters(point, seekerPoint) > threshold,
    summary:
      yesNoAnswer === 'yes'
        ? `Radar keeps the candidate area within approximately ${Math.round(threshold)}m of the seeker's latest location.`
        : `Radar removes the area within approximately ${Math.round(threshold)}m of the seeker's latest location.`,
    detail: 'Circular range checks are approximated with a bounded sampling grid inside the selected region.',
    reasoningSteps: [
      'Used the seeker’s latest authoritative location sample.',
      yesNoAnswer === 'yes'
        ? 'Kept sampled cells whose centers fall inside the distance threshold.'
        : 'Removed sampled cells whose centers fall inside the distance threshold.'
    ],
    featureCoverage: 'exact',
    overlayGeometries: [circle],
    metadata: {
      radiusMeters: threshold,
      answer: yesNoAnswer,
      ...metadata
    }
  });
}

function resolveThermometer(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const movement = playerMovementHistory(context.aggregate, context.question.askedByPlayerId);
  if (movement.length < 2) {
    return metadataOnlyDraft({
      summary: 'Thermometer could not resolve because seeker movement history is incomplete.',
      reasoningSteps: ['At least two seeker location samples are required.'],
      metadata
    });
  }

  const relation = answerValue(context.question.answer);
  const previous = movement[movement.length - 2];
  const current = movement[movement.length - 1];

  if (relation === 'hotter' || relation === 'colder') {
    const exactGeometry = relationHalfPlane({
      from: previous,
      to: current,
      relation: relation === 'hotter' ? 'closer_to_to' : 'closer_to_from',
      subject: baseGeometry
    });

    return exactGeometryOutcome({
      geometry: exactGeometry,
      summary:
        relation === 'hotter'
          ? 'Thermometer keeps areas closer to the seeker’s newer location than the previous one.'
          : 'Thermometer keeps areas closer to the seeker’s previous location than the newer one.',
      detail: 'This is an exact half-plane clip derived from the last two seeker samples.',
      reasoningSteps: [
        'Used the two most recent seeker location samples.',
        'Computed the perpendicular bisector between them.',
        relation === 'hotter'
          ? 'Kept the side of the bisector that is closer to the newer sample.'
          : 'Kept the side of the bisector that is closer to the older sample.'
      ],
      featureCoverage: 'exact',
      metadata
    });
  }

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => Math.abs(distanceMeters(point, current) - distanceMeters(point, previous)) <= 250,
    summary: 'Thermometer keeps a narrow approximate corridor where the last two seeker samples are equally distant.',
    detail: 'The equality case is approximated as a bounded strip around the perpendicular bisector.',
    reasoningSteps: [
      'Used the two most recent seeker location samples.',
      'Sampled the current candidate area.',
      'Kept cells whose distance difference to the two samples stays within 250 meters.'
    ],
    featureCoverage: 'exact',
    metadata
  });
}

function resolveMatching(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  seekerPoint: LonLat,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  if (context.constraint.kind === 'same_admin_region') {
    return metadataOnlyDraft({
      summary: 'Administrative-region matching is recorded as metadata-only.',
      detail: 'This pack does not yet provide region-boundary metadata sufficient for automatic spatial narrowing.',
      reasoningSteps: ['Kept the current candidate area unchanged and recorded the answer for manual reasoning.'],
      metadata
    });
  }

  const features = featureData(metadata);
  const featureIds = featureClassIds(context.template);
  const nearest = queryNearestFeature({
    features,
    featureClassIds: featureIds,
    point: seekerPoint
  });

  if (!nearest.feature) {
    return metadataOnlyDraft({
      summary: 'Matching could not resolve because no matching features were available.',
      detail: nearest.reason,
      reasoningSteps: ['No usable nearest feature could be determined for the seeker.'],
      metadata
    });
  }

  const answer = answerValue(context.question.answer);
  if (answer !== 'yes' && answer !== 'no') {
    return metadataOnlyDraft({
      summary: 'Matching answer was not recognized as yes/no.',
      reasoningSteps: ['Expected a yes/no answer for Matching.'],
      metadata
    });
  }

  const nearestPoint = nearest.feature.representativePoint
    ? [nearest.feature.representativePoint.longitude, nearest.feature.representativePoint.latitude] as LonLat
    : representativePointFromGeometry(nearest.feature.geometry);
  const allClassFeatures = features.filter((feature) => featureIds.includes(feature.featureClassId));

  if (
    answer === 'yes' &&
    nearest.precision === 'exact' &&
    nearestPoint &&
    allClassFeatures.every((feature) => feature.representativePoint || feature.geometry)
  ) {
    let exactGeometry: GeoJsonGeometryModel | undefined = baseGeometry;
    for (const feature of allClassFeatures) {
      if (feature.featureId === nearest.feature.featureId) {
        continue;
      }

      const otherPoint = feature.representativePoint
        ? [feature.representativePoint.longitude, feature.representativePoint.latitude] as LonLat
        : representativePointFromGeometry(feature.geometry);

      if (!otherPoint) {
        continue;
      }

      exactGeometry = relationHalfPlane({
        from: otherPoint,
        to: nearestPoint,
        relation: 'closer_to_to',
        subject: exactGeometry!
      });

      if (!exactGeometry) {
        break;
      }
    }

    return exactGeometryOutcome({
      geometry: exactGeometry,
      summary: `Matching keeps the area whose nearest ${nearest.feature.label} matches the seeker's nearest feature.`,
      detail: 'Exact point-feature Voronoi clipping was available for this answer.',
      reasoningSteps: [
        `The seeker's nearest matching feature is ${nearest.feature.label}.`,
        'All matching features were exact point features.',
        'The candidate area was clipped by the Voronoi cell of that feature.'
      ],
      featureCoverage: 'exact',
      metadata: {
        nearestFeatureId: nearest.feature.featureId,
        ...metadata
      }
    });
  }

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const candidateNearest = queryNearestFeature({
        features,
        featureClassIds: featureIds,
        point
      });
      return answer === 'yes'
        ? candidateNearest.feature?.featureId === nearest.feature?.featureId
        : candidateNearest.feature?.featureId !== nearest.feature?.featureId;
    },
    summary:
      answer === 'yes'
        ? `Matching approximately keeps areas whose nearest ${nearest.feature.label} matches the seeker's nearest feature.`
        : `Matching approximately removes areas whose nearest ${nearest.feature.label} matches the seeker's nearest feature.`,
    detail: nearest.reason,
    reasoningSteps: [
      `The seeker's nearest matching feature is ${nearest.feature.label}.`,
      answer === 'yes'
        ? 'Sampled cells were kept when they resolved to the same nearest feature.'
        : 'Sampled cells were kept when they resolved to a different nearest feature.'
    ],
    featureCoverage: nearest.precision,
    metadata: {
      nearestFeatureId: nearest.feature.featureId,
      ...metadata
    }
  });
}

function resolveMeasuring(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  seekerPoint: LonLat,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const features = featureData(metadata);
  const featureIds = featureClassIds(context.template);
  const seekerNearest = queryNearestFeature({
    features,
    featureClassIds: featureIds,
    point: seekerPoint
  });

  if (!seekerNearest.feature || typeof seekerNearest.distanceMeters !== 'number') {
    return metadataOnlyDraft({
      summary: 'Measuring could not resolve because no target feature distance was available for the seeker.',
      detail: seekerNearest.reason,
      reasoningSteps: ['No usable nearest target feature was found.'],
      metadata
    });
  }

  const relation = answerValue(context.question.answer);
  if (relation !== 'closer' && relation !== 'further' && relation !== 'same') {
    return metadataOnlyDraft({
      summary: 'Measuring answer was not recognized as closer/further/same.',
      reasoningSteps: ['Expected one of: closer, further, same.'],
      metadata
    });
  }

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const nearestForPoint = queryNearestFeature({
        features,
        featureClassIds: featureIds,
        point
      });
      if (typeof nearestForPoint.distanceMeters !== 'number') {
        return false;
      }

      return pointDistanceRelation(nearestForPoint.distanceMeters, seekerNearest.distanceMeters!, relation, 150);
    },
    summary: `Measuring approximately keeps areas whose distance to ${seekerNearest.feature.label} is ${relation} than the seeker's.`,
    detail: seekerNearest.reason,
    reasoningSteps: [
      `The seeker's reference distance is ${Math.round(seekerNearest.distanceMeters)} meters.`,
      'Sampled cells were compared to the same feature class using representative-point distances.'
    ],
    featureCoverage: seekerNearest.precision,
    metadata: {
      referenceDistanceMeters: seekerNearest.distanceMeters,
      referenceFeatureId: seekerNearest.feature.featureId,
      ...metadata
    }
  });
}

function resolveTentacles(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const features = featureData(metadata);
  const featureIds = featureClassIds(context.template);
  const allCandidates = features.filter((feature) => featureIds.includes(feature.featureClassId));
  const selectedFeatureId = featureAnswerId(context.question.answer);

  if (!selectedFeatureId) {
    return metadataOnlyDraft({
      summary: 'Tentacles answer did not identify a selected feature.',
      reasoningSteps: ['Expected a selected feature identifier or label.'],
      metadata
    });
  }

  const chosen = allCandidates.find(
    (feature) =>
      feature.featureId === selectedFeatureId ||
      feature.label.toLowerCase() === selectedFeatureId.toLowerCase()
  );

  if (!chosen) {
    return metadataOnlyDraft({
      summary: 'Tentacles selected feature was not found in the provided candidate features.',
      reasoningSteps: ['No matching candidate feature could be resolved from the answer.'],
      metadata
    });
  }

  const threshold =
    typeof context.template.parameters?.distanceThreshold === 'object'
      ? (context.template.parameters.distanceThreshold as Record<string, unknown>).meters
      : undefined;

  if (typeof threshold !== 'number' || threshold <= 0) {
    return metadataOnlyDraft({
      summary: 'Tentacles could not resolve because the distance threshold is missing.',
      reasoningSteps: ['A numeric distance threshold is required for Tentacles.'],
      metadata
    });
  }

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const nearbyCandidates = allCandidates.filter((feature) => {
        const reference = feature.representativePoint
          ? [feature.representativePoint.longitude, feature.representativePoint.latitude] as LonLat
          : representativePointFromGeometry(feature.geometry);
        return reference ? distanceMeters(reference, point) <= threshold : false;
      });

      if (nearbyCandidates.length === 0) {
        return false;
      }

      const closest = queryClosestAmongCandidates({
        candidates: nearbyCandidates,
        point
      });

      return closest.feature?.featureId === chosen.featureId;
    },
    summary: `Tentacles approximately keeps areas where ${chosen.label} is the closest qualifying candidate within ${Math.round(threshold)} meters.`,
    detail: 'Candidate choice is resolved with bounded sampling because it depends on nearby-feature sets and distance thresholds.',
    reasoningSteps: [
      'Sampled the current candidate area.',
      `For each sampled cell, considered candidates within ${Math.round(threshold)} meters.`,
      `Kept cells where ${chosen.label} was the closest candidate.`
    ],
    featureCoverage: chosen.coverage,
    metadata: {
      selectedFeatureId: chosen.featureId,
      distanceThresholdMeters: threshold,
      ...metadata
    }
  });
}

function resolvePhotos(
  context: QuestionConstraintResolutionContext,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const count = attachmentCount(context.question.answer);
  return metadataOnlyDraft({
    summary: `Photo evidence recorded with ${count} attachment${count === 1 ? '' : 's'} for manual review.`,
    detail: 'Photo challenges do not automatically generate geometry in this engine.',
    reasoningSteps: [
      'Recorded the submitted attachments.',
      'Marked the result for manual or assisted review instead of spatial narrowing.'
    ],
    metadata: {
      attachmentCount: count,
      requiresManualApproval: true,
      ...metadata
    }
  });
}

export function resolveQuestionConstraint(
  context: QuestionConstraintResolutionContext
): ResolvedConstraintDraft {
  const metadata = context.resolutionMetadata ?? {};
  const override = spatialOverrideDraft(metadata);
  if (override) {
    return override;
  }

  const baseGeometry = currentSearchGeometry(context.aggregate);
  if (!baseGeometry) {
    return metadataOnlyDraft({
      summary: 'Constraint could not resolve because the current candidate geometry is unavailable.',
      reasoningSteps: ['The match does not have a current remaining-area geometry to narrow.'],
      metadata
    });
  }

  const seekerPoint = latestPlayerLocation(context.aggregate, context.question.askedByPlayerId);

  switch (context.category.resolverKind) {
    case 'threshold_distance':
      return seekerPoint
        ? resolveRadar(context, baseGeometry, seekerPoint, metadata)
        : metadataOnlyDraft({
            summary: 'Radar could not resolve because the seeker has no location sample.',
            reasoningSteps: ['A current seeker location is required for Radar.'],
            metadata
          });
    case 'hotter_colder':
      return resolveThermometer(context, baseGeometry, metadata);
    case 'nearest_feature_match':
      return seekerPoint
        ? resolveMatching(context, baseGeometry, seekerPoint, metadata)
        : metadataOnlyDraft({
            summary: 'Matching could not resolve because the seeker has no location sample.',
            reasoningSteps: ['A current seeker location is required for Matching.'],
            metadata
          });
    case 'comparative_distance':
      return seekerPoint
        ? resolveMeasuring(context, baseGeometry, seekerPoint, metadata)
        : metadataOnlyDraft({
            summary: 'Measuring could not resolve because the seeker has no location sample.',
            reasoningSteps: ['A current seeker location is required for Measuring.'],
            metadata
          });
    case 'nearest_candidate':
      return resolveTentacles(context, baseGeometry, metadata);
    case 'photo_challenge':
      return resolvePhotos(context, metadata);
    default:
      return metadataOnlyDraft({
        summary: `No automated resolver is registered for category ${context.category.categoryId}.`,
        reasoningSteps: ['Recorded the answer as metadata-only.'],
        metadata
      });
  }
}
