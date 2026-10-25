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
  pointInGeometry,
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

function measuredDistanceToleranceMeters(metadata: Record<string, unknown>): number {
  const automaticResolution = metadata.automaticResolution;
  if (automaticResolution && typeof automaticResolution === 'object') {
    const threshold = (automaticResolution as Record<string, unknown>).thresholdMeters;
    if (typeof threshold === 'number' && Number.isFinite(threshold) && threshold >= 0) return threshold;
  }
  return 150;
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
  relation: 'closer' | 'further',
  toleranceMeters: number
): boolean {
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
      : context.template.resolverConfig.thresholdMeters ?? context.question.chosenDistanceMeters;

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
  const provenance = metadata.automaticResolution as {
    movementStartSampleId?: string;
    movementEndSampleId?: string;
  } | undefined;
  const movementStart = context.aggregate.locationSamples.find((sample) => sample.sampleId === provenance?.movementStartSampleId);
  const movementEnd = context.aggregate.locationSamples.find((sample) => sample.sampleId === provenance?.movementEndSampleId);
  const movement = movementStart && movementEnd
    ? [[movementStart.longitude, movementStart.latitude] as LonLat, [movementEnd.longitude, movementEnd.latitude] as LonLat]
    : playerMovementHistory(context.aggregate, context.question.askedByPlayerId);
  const usesFrozenMovement = Boolean(movementStart && movementEnd);
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
      detail: usesFrozenMovement
        ? 'This exact half-plane clip uses the seeker start and end locations frozen when the Thermometer question was accepted.'
        : 'This is an exact half-plane clip derived from the last two seeker samples.',
      reasoningSteps: [
        usesFrozenMovement
          ? 'Used the frozen Thermometer start and end locations from the question provenance.'
          : 'Used the two most recent seeker location samples.',
        'Computed the perpendicular bisector between them.',
        relation === 'hotter'
          ? 'Kept the side of the bisector that is closer to the newer sample.'
          : 'Kept the side of the bisector that is closer to the older sample.'
      ],
      featureCoverage: 'exact',
      metadata
    });
  }
  const toleranceMeters = measuredDistanceToleranceMeters(metadata);

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
    const referenceId = metadata.referenceAdminBoundaryId;
    const answer = answerValue(context.question.answer);
    const referenceBoundary = typeof referenceId === 'string'
      ? featureData(metadata).find((feature) => feature.featureId === referenceId)
      : undefined;
    if (!referenceBoundary?.geometry || (answer !== 'yes' && answer !== 'no')) {
      return metadataOnlyDraft({
        summary: 'Administrative-region matching could not load a usable boundary.',
        detail: 'The selected administrative division boundary was incomplete, so the map was left unchanged.',
        reasoningSteps: ['No complete reference polygon was available for map clipping.'],
        metadata
      });
    }
    return approximateGridOutcome({
      baseGeometry,
      stepMeters: gridResolutionMeters(metadata),
      predicate: (point) => {
        const insideReference = pointInGeometry(point, referenceBoundary.geometry);
        return answer === 'yes' ? insideReference : !insideReference;
      },
      summary: answer === 'yes'
        ? `Administrative matching keeps the selected ${referenceBoundary.label} division.`
        : `Administrative matching removes the selected ${referenceBoundary.label} division.`,
      detail: 'The authoritative answer compares the same OSM administrative boundary at each player’s fresh location. The polygon is sampled to narrow the search map.',
      reasoningSteps: [
        `The seeker is in ${referenceBoundary.label}.`,
        answer === 'yes'
          ? 'Kept candidate cells inside that administrative division.'
          : 'Kept candidate cells outside that administrative division.'
      ],
      featureCoverage: 'approximate',
      metadata: { referenceAdminBoundaryId: referenceBoundary.featureId, ...metadata }
    });
  }

  if (featureClassIds(context.template).includes('landmass')) {
    const features = featureData(metadata);
    const referenceFeatureId = metadata.landmassReferenceFeatureId;
    const reference = typeof referenceFeatureId === 'string'
      ? features.find((feature) => feature.featureId === referenceFeatureId && feature.featureClassId === 'landmass')
      : undefined;
    const answer = answerValue(context.question.answer);
    if (!reference?.geometry || (answer !== 'yes' && answer !== 'no')) {
      return metadataOnlyDraft({
        summary: 'Landmass matching could not narrow the map because a complete island boundary was unavailable.',
        detail: 'Continental landmasses and incomplete island geometry require a manual ruling.',
        reasoningSteps: ['No complete seeker landmass polygon was recorded with the answer.'],
        metadata
      });
    }
    const nestedIds = Array.isArray(metadata.nestedLandmassFeatureIds)
      ? metadata.nestedLandmassFeatureIds.filter((id): id is string => typeof id === 'string')
      : [];
    const matchingLandmasses = features.filter((feature) =>
      feature.featureClassId === 'landmass' &&
      (feature.featureId === reference.featureId || nestedIds.includes(feature.featureId)) &&
      Boolean(feature.geometry));
    return approximateGridOutcome({
      baseGeometry,
      stepMeters: gridResolutionMeters(metadata),
      predicate: (point) => {
        const insideMatchingLandmass = matchingLandmasses.some((feature) => pointInGeometry(point, feature.geometry));
        return answer === 'yes' ? insideMatchingLandmass : !insideMatchingLandmass;
      },
      summary: answer === 'yes'
        ? 'Landmass matching keeps the seeker’s mapped landmass and enclosed island landmasses.'
        : 'Landmass matching removes the seeker’s mapped landmass and enclosed island landmasses.',
      detail: 'The scanned rule counts a hider landmass fully surrounded by the seeker’s landmass as a match. This polygon deduction is approximate and only runs when both player fixes fall inside complete mapped island polygons.',
      reasoningSteps: [
        'Used the seeker’s mapped island polygon as the reference landmass.',
        'Included mapped landmass polygons enclosed by the seeker’s outer boundary.',
        answer === 'yes'
          ? 'Kept candidate cells within the matched landmass set.'
          : 'Kept candidate cells outside the matched landmass set.'
      ],
      featureCoverage: 'approximate',
      metadata: { landmassReferenceFeatureId: reference.featureId, nestedLandmassFeatureIds: matchingLandmasses.map((feature) => feature.featureId), ...metadata }
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
  const stationNameLengthMatching = featureIds.includes('stations-name-length');

  if (stationNameLengthMatching) {
    const referenceNameLength = Array.from(nearest.feature.label.trim().normalize('NFC')).length;
    return approximateGridOutcome({
      baseGeometry,
      stepMeters: gridResolutionMeters(metadata),
      predicate: (point) => {
        const candidateNearest = queryNearestFeature({ features, featureClassIds: featureIds, point });
        if (!candidateNearest.feature) return false;
        const candidateMatches = Array.from(candidateNearest.feature.label.trim().normalize('NFC')).length === referenceNameLength;
        return answer === 'yes' ? candidateMatches : !candidateMatches;
      },
      summary: answer === 'yes'
        ? `Matching keeps areas whose nearest station name has the same length (${referenceNameLength} characters) as the seeker's nearest station.`
        : `Matching keeps areas whose nearest station name has a different length from the seeker's nearest station (${referenceNameLength} characters).`,
      detail: 'Station-name matching counts spaces and hyphens in the displayed station name. The map deduction uses the same nearest-station name-length comparison as the automatic answer.',
      reasoningSteps: [
        `The seeker's nearest station name has ${referenceNameLength} characters.`,
        answer === 'yes'
          ? 'Sampled cells were kept when their nearest station name had the same character count.'
          : 'Sampled cells were kept when their nearest station name had a different character count.'
      ],
      featureCoverage: 'approximate',
      metadata: {
        nearestFeatureId: nearest.feature.featureId,
        nearestStationNameLength: referenceNameLength,
        ...metadata
      }
    });
  }

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
  const referenceFeatureId = typeof metadata.referenceFeatureId === 'string'
    ? metadata.referenceFeatureId
    : undefined;
  const measuringFeatures = referenceFeatureId
    ? features.filter((feature) => feature.featureId === referenceFeatureId)
    : features;
  const seekerNearest = queryNearestFeature({
    features: measuringFeatures,
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
  if (relation !== 'closer' && relation !== 'further') {
    return metadataOnlyDraft({
      summary: 'Measuring answer was not recognized as closer/further.',
      reasoningSteps: ['Expected one of: closer, further.'],
      metadata
    });
  }
  const toleranceMeters = measuredDistanceToleranceMeters(metadata);

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const nearestForPoint = queryNearestFeature({
        features: measuringFeatures,
        featureClassIds: featureIds,
        point
      });
      if (typeof nearestForPoint.distanceMeters !== 'number') {
        return false;
      }

      return pointDistanceRelation(nearestForPoint.distanceMeters, seekerNearest.distanceMeters!, relation, toleranceMeters);
    },
    summary: `Measuring approximately keeps areas whose distance to ${seekerNearest.feature.label} is ${relation} than the seeker's.`,
    detail: seekerNearest.reason,
    reasoningSteps: [
      `The seeker's reference distance is ${Math.round(seekerNearest.distanceMeters)} meters.`,
      'Sampled cells were compared to the same target geometry using its recorded distance tolerance.'
    ],
    featureCoverage: seekerNearest.precision,
    metadata: {
      referenceDistanceMeters: seekerNearest.distanceMeters,
      referenceFeatureId: seekerNearest.feature.featureId,
      distanceToleranceMeters: toleranceMeters,
      ...metadata
    }
  });
}

function seaLevelRangeForPoint(features: GeoFeatureRecord[], point: LonLat): {
  minimumMeters: number;
  maximumMeters: number;
} | undefined {
  const samples = features.flatMap((feature) => {
    const representativePoint = feature.representativePoint;
    const elevationMeters = feature.properties?.elevationMeters;
    const verticalErrorMeters = feature.properties?.absoluteVerticalErrorMeters;
    const gridSpacingMeters = feature.properties?.gridSpacingMeters;
    if (feature.featureClassId !== 'sea-level' || !representativePoint || typeof elevationMeters !== 'number' ||
      !Number.isFinite(elevationMeters) || typeof verticalErrorMeters !== 'number' ||
      !Number.isFinite(verticalErrorMeters) || typeof gridSpacingMeters !== 'number' ||
      !Number.isFinite(gridSpacingMeters) || gridSpacingMeters <= 0) return [];
    const distanceMetersFromPoint = distanceMeters(point, [representativePoint.longitude, representativePoint.latitude]);
    return [{ feature, elevationMeters, verticalErrorMeters, gridSpacingMeters, distanceMetersFromPoint }];
  }).sort((left, right) => left.distanceMetersFromPoint - right.distanceMetersFromPoint);
  const nearest = samples[0];
  if (!nearest || nearest.distanceMetersFromPoint > nearest.gridSpacingMeters * 2) return undefined;
  const localReliefMeters = samples
    .filter((sample) => sample.distanceMetersFromPoint <= nearest.gridSpacingMeters * 1.5)
    .reduce((maximum, sample) => Math.max(maximum, Math.abs(sample.elevationMeters - nearest.elevationMeters)), 0);
  const uncertainty = nearest.verticalErrorMeters + localReliefMeters;
  const distanceFromSeaLevel = Math.abs(nearest.elevationMeters);
  return {
    minimumMeters: Math.max(0, distanceFromSeaLevel - uncertainty),
    maximumMeters: distanceFromSeaLevel + uncertainty
  };
}

function resolveSeaLevel(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  metadata: Record<string, unknown>
): ResolvedConstraintDraft {
  const features = featureData(metadata);
  const relation = answerValue(context.question.answer);
  const referenceElevation = metadata.seaLevelReferenceElevationMeters;
  const referenceUncertainty = metadata.seaLevelReferenceUncertaintyMeters;
  if ((relation !== 'closer' && relation !== 'further') || typeof referenceElevation !== 'number' ||
    !Number.isFinite(referenceElevation) || typeof referenceUncertainty !== 'number' ||
    !Number.isFinite(referenceUncertainty) || referenceUncertainty < 0) {
    return metadataOnlyDraft({
      summary: 'Sea Level could not narrow the map because its reference elevation is incomplete.',
      reasoningSteps: ['No trusted seeker elevation interval was recorded with the answer.'],
      metadata
    });
  }

  const referenceDistance = Math.abs(referenceElevation);
  const referenceMinimum = Math.max(0, referenceDistance - referenceUncertainty);
  const referenceMaximum = referenceDistance + referenceUncertainty;
  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const candidateRange = seaLevelRangeForPoint(features, point);
      if (!candidateRange) return false;
      return relation === 'closer'
        ? candidateRange.maximumMeters < referenceMinimum
        : candidateRange.minimumMeters > referenceMaximum;
    },
    summary: relation === 'closer'
      ? 'Sea Level keeps approximate areas that are confidently closer to mean sea level than the seeker.'
      : 'Sea Level keeps approximate areas that are confidently further from mean sea level than the seeker.',
    detail: 'The map uses the same authority-loaded Copernicus GLO-90 grid as the answer. It is a 90 m digital surface model, may include buildings or vegetation, and leaves cells ambiguous when local relief or vertical error overlaps the comparison.',
    reasoningSteps: [
      'Used the seeker’s reference elevation and uncertainty interval frozen with the automatic answer.',
      'Compared candidate cells to the same 90 m EGM2008 elevation samples.',
      'Kept only cells whose elevation interval is clearly on the answered side of the comparison.'
    ],
    featureCoverage: 'approximate',
    metadata: {
      referenceDistanceFromSeaLevelMeters: referenceDistance,
      referenceUncertaintyMeters: referenceUncertainty,
      ...metadata
    }
  });
}

function resolveTentacles(
  context: QuestionConstraintResolutionContext,
  baseGeometry: GeoJsonGeometryModel,
  seekerPoint: LonLat | undefined,
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

  if (!seekerPoint) {
    return metadataOnlyDraft({
      summary: 'Tentacles could not narrow the map because the asking seeker location was unavailable.',
      reasoningSteps: ['The seeker location anchors the printed Tentacles reach radius.'],
      metadata
    });
  }

  const candidateFeatures = allCandidates.filter((feature) => {
    const reference = feature.representativePoint
      ? [feature.representativePoint.longitude, feature.representativePoint.latitude] as LonLat
      : representativePointFromGeometry(feature.geometry);
    return reference ? distanceMeters(reference, seekerPoint) <= threshold : false;
  });

  if (!candidateFeatures.some((feature) => feature.featureId === chosen.featureId)) {
    return metadataOnlyDraft({
      summary: "Tentacles selected feature was outside the seeker's printed reach radius.",
      reasoningSteps: ['Only features within reach of the asking seeker can form the Tentacles candidate set.'],
      metadata
    });
  }

  return approximateGridOutcome({
    baseGeometry,
    stepMeters: gridResolutionMeters(metadata),
    predicate: (point) => {
      const closest = queryClosestAmongCandidates({
        candidates: candidateFeatures,
        point
      });

      return distanceMeters(point, seekerPoint) <= threshold && closest.feature?.featureId === chosen.featureId;
    },
    summary: `Tentacles approximately keeps areas inside the seeker's ${Math.round(threshold)} meter reach where ${chosen.label} is the closest reachable candidate.`,
    detail: 'The candidate set is anchored to the asking seeker, then the hider area is sampled inside that radius.',
    reasoningSteps: [
      'Sampled the current candidate area.',
      `Built the candidate set from features within ${Math.round(threshold)} meters of the asking seeker.`,
      `Kept cells inside the seeker's reach where ${chosen.label} was the closest candidate.`
    ],
    featureCoverage: chosen.coverage,
    metadata: {
      selectedFeatureId: chosen.featureId,
      distanceThresholdMeters: threshold,
      candidateFeatureIds: candidateFeatures.map((feature) => feature.featureId),
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
        ? featureClassIds(context.template).includes('sea-level')
          ? resolveSeaLevel(context, baseGeometry, metadata)
          : resolveMeasuring(context, baseGeometry, seekerPoint, metadata)
        : metadataOnlyDraft({
            summary: 'Measuring could not resolve because the seeker has no location sample.',
            reasoningSteps: ['A current seeker location is required for Measuring.'],
            metadata
          });
    case 'nearest_candidate':
      return resolveTentacles(context, baseGeometry, seekerPoint, metadata);
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
