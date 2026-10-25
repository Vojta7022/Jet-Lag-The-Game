import type {
  ContentPack,
  LocationSampleModel,
  MatchAggregate,
  QuestionCategoryDefinition,
  QuestionFeatureDatasetModel,
  QuestionTemplateDefinition
} from '../../../shared-types/src/index.ts';
import {
  distanceMeters,
  pointInGeometry,
  queryClosestAmongCandidates,
  queryNearestFeature,
  polygonRingsFromGeometry,
  distanceToAdministrativeBoundaryMeters,
  distanceToFeatureMeters,
  selectAdministrativeDivisionAtPoint,
  type GeoFeatureRecord
} from '../../../geo/src/index.ts';

export const AUTOMATIC_QUESTION_RESOLVER_VERSION = 'jetlag-location-v2';
const DEFAULT_MAX_FIX_AGE_SECONDS = 30;
const DEFAULT_MAX_FIX_ACCURACY_METERS = 50;

export type AutomaticQuestionAnswerResult =
  | { kind: 'manual' }
  | { kind: 'blocked'; code: 'LOCATION_FIX_REQUIRED' | 'LOCATION_ANSWER_AMBIGUOUS' | 'TRAVEL_DISTANCE_REQUIRED'; message: string }
  | {
      kind: 'resolved';
      answer: Record<string, unknown>;
      constraintId?: string;
      automaticResolution: {
        resolverVersion: string;
        method: 'threshold_distance' | 'hotter_colder' | 'nearest_feature_match' | 'comparative_distance' | 'nearest_candidate';
        sourceSampleIds: string[];
        sourceRecordedAt: string[];
        sourceAccuracyMeters: number[];
        thresholdMeters: number;
        movementStartSampleId?: string;
        movementEndSampleId?: string;
        featureDatasetSource?: string;
        featureDatasetVersion?: string;
        featureDatasetRetrievedAt?: string;
        referenceFeatureId?: string;
      };
      constraintMetadata?: Record<string, unknown>;
    };

function latestSample(samples: LocationSampleModel[], predicate: (sample: LocationSampleModel) => boolean) {
  return samples.filter(predicate).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
}

function numericPolicy(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function toGeoFeatureRecords(dataset: QuestionFeatureDatasetModel): GeoFeatureRecord[] {
  return dataset.features.map((feature) => ({
    featureId: feature.featureId,
    featureClassId: feature.featureClassId,
    label: feature.label,
    representativePoint: { latitude: feature.latitude, longitude: feature.longitude },
    geometry: feature.geometry,
    geometrySupport: feature.geometrySupport,
    coverage: feature.coverage,
    properties: feature.properties
  }));
}

function administrativeDivisionOrdinal(template: QuestionTemplateDefinition): number | undefined {
  const featureClassId = template.featureClassRefs?.[0]?.featureClassId ?? '';
  const match = featureClassId.match(/^([1-4])(?:st|nd|rd|th)-admin-/);
  return match ? Number(match[1]) : undefined;
}

function datasetProvenanceFor(dataset: QuestionFeatureDatasetModel) {
  return {
    featureDatasetSource: dataset.source,
    featureDatasetVersion: dataset.sourceVersion,
    featureDatasetRetrievedAt: dataset.retrievedAt
  };
}

interface SeaLevelDistanceRange {
  minimumMeters: number;
  maximumMeters: number;
  elevationMeters: number;
  uncertaintyMeters: number;
  featureId: string;
  gridSpacingMeters: number;
}

function seaLevelDistanceRange(args: {
  features: GeoFeatureRecord[];
  point: [number, number];
  horizontalAccuracyMeters: number;
}): SeaLevelDistanceRange | undefined {
  const samples = args.features.flatMap((feature) => {
    const representativePoint = feature.representativePoint;
    const elevationMeters = feature.properties?.elevationMeters;
    const verticalError = feature.properties?.absoluteVerticalErrorMeters;
    const gridSpacingMeters = feature.properties?.gridSpacingMeters;
    if (feature.featureClassId !== 'sea-level' || !representativePoint || typeof elevationMeters !== 'number' ||
      !Number.isFinite(elevationMeters) || typeof verticalError !== 'number' || !Number.isFinite(verticalError) ||
      typeof gridSpacingMeters !== 'number' || !Number.isFinite(gridSpacingMeters) || gridSpacingMeters <= 0) return [];
    const distance = distanceMeters(args.point, [representativePoint.longitude, representativePoint.latitude]);
    return [{ feature, elevationMeters, verticalError, gridSpacingMeters, distance }];
  }).sort((left, right) => left.distance - right.distance);
  const nearest = samples[0];
  if (!nearest || nearest.distance > nearest.gridSpacingMeters * 2 + args.horizontalAccuracyMeters) return undefined;

  const localRadiusMeters = nearest.gridSpacingMeters * 1.5 + args.horizontalAccuracyMeters;
  const nearbySamples = samples.filter((sample) => sample.distance <= localRadiusMeters);
  const localReliefMeters = nearbySamples.reduce((maximum, sample) =>
    Math.max(maximum, Math.abs(sample.elevationMeters - nearest.elevationMeters)), 0);
  const uncertaintyMeters = nearest.verticalError + localReliefMeters;
  const absoluteElevationMeters = Math.abs(nearest.elevationMeters);
  return {
    minimumMeters: Math.max(0, absoluteElevationMeters - uncertaintyMeters),
    maximumMeters: absoluteElevationMeters + uncertaintyMeters,
    elevationMeters: nearest.elevationMeters,
    uncertaintyMeters,
    featureId: nearest.feature.featureId,
    gridSpacingMeters: nearest.gridSpacingMeters
  };
}

function nearestFeatureHasConfidentMargin(args: {
  features: GeoFeatureRecord[];
  featureClassIds: string[];
  point: [number, number];
  accuracyMeters: number;
}): { feature?: GeoFeatureRecord; ambiguous: boolean } {
  const ranked = args.features
    .filter((feature) => args.featureClassIds.includes(feature.featureClassId))
    .map((feature) => ({
      feature,
      distance: distanceToFeatureMeters(args.point, feature)
    }))
    .filter((candidate): candidate is { feature: GeoFeatureRecord; distance: number } =>
      typeof candidate.distance === 'number' && Number.isFinite(candidate.distance))
    .sort((left, right) => left.distance - right.distance);
  const nearest = ranked[0];
  const second = ranked[1];
  return {
    feature: nearest?.feature,
    ambiguous: Boolean(nearest && second && second.distance - nearest.distance <= args.accuracyMeters * 2)
  };
}

function landmassFeatureAtPoint(args: {
  features: GeoFeatureRecord[];
  point: [number, number];
}): GeoFeatureRecord | undefined {
  return args.features.flatMap((feature) => {
    if (feature.featureClassId !== 'landmass' || !feature.geometry ||
      !pointInGeometry(args.point, feature.geometry)) return [];
    const boundaryDistance = distanceToAdministrativeBoundaryMeters(args.point, feature);
    return boundaryDistance === undefined ? [] : [{ feature, boundaryDistance }];
  }).sort((left, right) => left.boundaryDistance - right.boundaryDistance)[0]?.feature;
}

function landmassContainedBy(container: GeoFeatureRecord, candidate: GeoFeatureRecord): boolean {
  const containerOuterRings = polygonRingsFromGeometry(container.geometry).map((polygon) => polygon[0]).filter(Boolean);
  const candidateOuterRings = polygonRingsFromGeometry(candidate.geometry).map((polygon) => polygon[0]).filter(Boolean);
  return containerOuterRings.some((containerRing) => candidateOuterRings.some((candidateRing) => {
    if (!containerRing || !candidateRing || candidateRing.length < 4) return false;
    const containerOuter = { type: 'Polygon' as const, coordinates: [containerRing] };
    return candidateRing.every((point, index) => {
      const next = candidateRing[(index + 1) % candidateRing.length];
      if (!pointInGeometry(point, containerOuter)) return false;
      if (!next) return false;
      const midpoint: [number, number] = [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2];
      return pointInGeometry(midpoint, containerOuter);
    });
  }));
}

export function resolveAutomaticQuestionAnswer(args: {
  aggregate: MatchAggregate;
  contentPack: ContentPack;
  category: QuestionCategoryDefinition;
  template: QuestionTemplateDefinition;
  askedByPlayerId: string;
  targetTeamId?: string;
  chosenDistanceMeters?: number;
  occurredAt: string;
  questionFeatureDataset?: QuestionFeatureDatasetModel;
}): AutomaticQuestionAnswerResult {
  const { aggregate, contentPack, category, template } = args;
  if (category.answerPolicy === 'manual') return { kind: 'manual' };
  if (!['threshold_distance', 'hotter_colder', 'nearest_feature_match', 'comparative_distance', 'nearest_candidate'].includes(category.resolverKind)) return { kind: 'manual' };
  const adminDivisionOrdinal = administrativeDivisionOrdinal(template);
  if (
    (category.resolverKind === 'nearest_feature_match' || category.resolverKind === 'comparative_distance' || category.resolverKind === 'nearest_candidate') &&
    (!args.questionFeatureDataset ||
      (template.featureClassRefs ?? []).length === 0 ||
      !args.questionFeatureDataset.features.some((feature) =>
        (template.featureClassRefs ?? []).some((reference) => reference.featureClassId === feature.featureClassId) ||
        (adminDivisionOrdinal !== undefined && feature.featureClassId === 'admin-boundary')))
  ) return { kind: 'manual' };

  const seeker = latestSample(aggregate.locationSamples, (sample) =>
    sample.playerId === args.askedByPlayerId && sample.role === 'seeker' &&
    aggregate.roleAssignments[sample.playerId]?.role === 'seeker');
  const hiderTeamId = args.targetTeamId ?? Object.values(aggregate.teams).find((team) => team.side === 'hider')?.teamId;
  if (!hiderTeamId || aggregate.teams[hiderTeamId]?.side !== 'hider') {
    return { kind: 'blocked', code: 'LOCATION_FIX_REQUIRED', message: 'Choose the active hider team before resolving this location question.' };
  }
  const hider = latestSample(aggregate.locationSamples, (sample) =>
    sample.teamId === hiderTeamId && sample.role === 'hider' &&
    aggregate.roleAssignments[sample.playerId]?.role === 'hider');
  const ruleset = contentPack.rulesets.find((candidate) => candidate.rulesetId === aggregate.selectedRulesetId);
  const maxAgeSeconds = numericPolicy(ruleset?.locationPolicies.automaticQuestionMaxAgeSeconds, DEFAULT_MAX_FIX_AGE_SECONDS);
  const maxAccuracyMeters = numericPolicy(ruleset?.locationPolicies.automaticQuestionMaxAccuracyMeters, DEFAULT_MAX_FIX_ACCURACY_METERS);
  const requestedAtMs = Date.parse(args.occurredAt);

  const fixIsUsable = (sample: LocationSampleModel | undefined) => {
    if (!sample || sample.source !== 'device' || typeof sample.accuracyMeters !== 'number' ||
      !Number.isFinite(sample.accuracyMeters) || sample.accuracyMeters < 0 ||
      sample.accuracyMeters > maxAccuracyMeters) {
      return false;
    }
    const recordedAtMs = Date.parse(sample.recordedAt);
    const ageSeconds = (requestedAtMs - recordedAtMs) / 1000;
    return Number.isFinite(recordedAtMs) && ageSeconds >= 0 && ageSeconds <= maxAgeSeconds;
  };

  if (!fixIsUsable(seeker) || !fixIsUsable(hider)) {
    return {
      kind: 'blocked',
      code: 'LOCATION_FIX_REQUIRED',
      message: `A fresh and accurate location fix is required from the seeker and hider (within ${maxAgeSeconds} seconds and ${maxAccuracyMeters} meters accuracy).`
    };
  }

  const isSeaLevel = category.resolverKind === 'comparative_distance' &&
    (template.featureClassRefs ?? []).some((reference) => reference.featureClassId === 'sea-level');
  if (isSeaLevel) {
    const dataset = args.questionFeatureDataset;
    if (!dataset) return { kind: 'manual' };
    const features = toGeoFeatureRecords(dataset);
    const seekerRange = seaLevelDistanceRange({
      features,
      point: [seeker.longitude, seeker.latitude],
      horizontalAccuracyMeters: seeker.accuracyMeters!
    });
    const hiderRange = seaLevelDistanceRange({
      features,
      point: [hider.longitude, hider.latitude],
      horizontalAccuracyMeters: hider.accuracyMeters!
    });
    if (!seekerRange || !hiderRange) return { kind: 'manual' };

    const value = hiderRange.maximumMeters < seekerRange.minimumMeters
      ? 'closer'
      : hiderRange.minimumMeters > seekerRange.maximumMeters
        ? 'further'
        : undefined;
    if (!value) return { kind: 'manual' };

    const constraintRefs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
    const constraint = contentPack.constraints.find((candidate) =>
      constraintRefs.has(candidate.constraintId) && candidate.kind === 'comparative_distance');
    if (!constraint) return { kind: 'manual' };
    const datasetProvenance = datasetProvenanceFor(dataset);
    return {
      kind: 'resolved',
      answer: { value },
      constraintId: constraint.constraintId,
      automaticResolution: {
        resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
        method: 'comparative_distance',
        sourceSampleIds: [seeker.sampleId, hider.sampleId],
        sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
        sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
        thresholdMeters: seekerRange.uncertaintyMeters + hiderRange.uncertaintyMeters,
        referenceFeatureId: seekerRange.featureId,
        ...datasetProvenance
      },
      constraintMetadata: {
        featureData: features,
        ...datasetProvenance,
        featureDataCoverage: dataset.coverage,
        gridResolutionMeters: Math.max(500, seekerRange.gridSpacingMeters * 2),
        seaLevelReferenceElevationMeters: seekerRange.elevationMeters,
        seaLevelReferenceUncertaintyMeters: seekerRange.uncertaintyMeters
      }
    };
  }

  if (category.resolverKind === 'nearest_feature_match' && adminDivisionOrdinal !== undefined) {
    const dataset = args.questionFeatureDataset;
    if (!dataset) return { kind: 'manual' };
    const seekerBoundary = selectAdministrativeDivisionAtPoint(
      dataset.features, [seeker.longitude, seeker.latitude], adminDivisionOrdinal
    );
    const hiderBoundary = selectAdministrativeDivisionAtPoint(
      dataset.features, [hider.longitude, hider.latitude], adminDivisionOrdinal
    );
    if (!seekerBoundary || !hiderBoundary) return { kind: 'manual' };
    const seekerBoundaryDistance = distanceToAdministrativeBoundaryMeters(
      [seeker.longitude, seeker.latitude], seekerBoundary
    );
    const hiderBoundaryDistance = distanceToAdministrativeBoundaryMeters(
      [hider.longitude, hider.latitude], hiderBoundary
    );
    if (seekerBoundaryDistance === undefined || hiderBoundaryDistance === undefined ||
      seekerBoundaryDistance <= seeker.accuracyMeters! || hiderBoundaryDistance <= hider.accuracyMeters!) {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty overlaps an administrative border. Refresh both locations or resolve this question manually.'
      };
    }
    const constraintRefs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
    const constraint = contentPack.constraints.find((candidate) =>
      constraintRefs.has(candidate.constraintId) && candidate.kind === 'same_admin_region');
    if (!constraint) return { kind: 'manual' };
    const features = toGeoFeatureRecords(dataset);
    return {
      kind: 'resolved',
      answer: { value: seekerBoundary.featureId === hiderBoundary.featureId ? 'yes' : 'no' },
      constraintId: constraint.constraintId,
      automaticResolution: {
        resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
        method: 'nearest_feature_match',
        sourceSampleIds: [seeker.sampleId, hider.sampleId],
        sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
        sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
        thresholdMeters: 0,
        referenceFeatureId: seekerBoundary.featureId,
        ...datasetProvenanceFor(dataset)
      },
      constraintMetadata: {
        featureData: features,
        featureDatasetSource: dataset.source,
        featureDatasetVersion: dataset.sourceVersion,
        featureDatasetRetrievedAt: dataset.retrievedAt,
        featureDataCoverage: dataset.coverage,
        gridResolutionMeters: 250,
        referenceAdminBoundaryId: seekerBoundary.featureId,
        adminDivisionOrdinal
      }
    };
  }

  if (category.resolverKind === 'nearest_feature_match' || category.resolverKind === 'comparative_distance') {
    const dataset = args.questionFeatureDataset;
    const featureClassIds = (template.featureClassRefs ?? []).map((feature) => feature.featureClassId);
    if (!dataset || featureClassIds.length === 0) return { kind: 'manual' };
    const features = toGeoFeatureRecords(dataset);
    const classFeatures = features.filter((feature) => featureClassIds.includes(feature.featureClassId));
    const constraintRefs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
    const constraint = contentPack.constraints.find((candidate) => constraintRefs.has(candidate.constraintId) &&
      candidate.kind === (category.resolverKind === 'nearest_feature_match' ? 'nearest_feature_match' : 'comparative_distance'));
    if (!constraint) return { kind: 'manual' };
    const datasetProvenance = {
      featureDatasetSource: dataset.source,
      featureDatasetVersion: dataset.sourceVersion,
      featureDatasetRetrievedAt: dataset.retrievedAt
    };

    if (category.resolverKind === 'nearest_feature_match') {
      if (featureClassIds.includes('landmass')) {
        const seekerPoint: [number, number] = [seeker.longitude, seeker.latitude];
        const hiderPoint: [number, number] = [hider.longitude, hider.latitude];
        const seekerLandmass = landmassFeatureAtPoint({ features, point: seekerPoint });
        const hiderLandmass = landmassFeatureAtPoint({ features, point: hiderPoint });
        if (!seekerLandmass || !hiderLandmass || !seekerLandmass.geometry || !hiderLandmass.geometry) {
          return { kind: 'manual' };
        }
        const seekerBoundaryDistance = distanceToAdministrativeBoundaryMeters(seekerPoint, seekerLandmass);
        const hiderBoundaryDistance = distanceToAdministrativeBoundaryMeters(hiderPoint, hiderLandmass);
        if (seekerBoundaryDistance === undefined || hiderBoundaryDistance === undefined ||
          seekerBoundaryDistance <= seeker.accuracyMeters! || hiderBoundaryDistance <= hider.accuracyMeters!) {
          return {
            kind: 'blocked',
            code: 'LOCATION_ANSWER_AMBIGUOUS',
            message: 'GPS uncertainty overlaps a mapped landmass boundary. Refresh both locations or answer this question manually.'
          };
        }
        const nestedLandmassFeatureIds = features.filter((feature) =>
          feature.featureClassId === 'landmass' && landmassContainedBy(seekerLandmass, feature))
          .map((feature) => feature.featureId);
        if (!nestedLandmassFeatureIds.includes(seekerLandmass.featureId)) {
          nestedLandmassFeatureIds.push(seekerLandmass.featureId);
        }
        const sameLandmass = seekerLandmass.featureId === hiderLandmass.featureId ||
          landmassContainedBy(seekerLandmass, hiderLandmass);
        return {
          kind: 'resolved',
          answer: { value: sameLandmass ? 'yes' : 'no' },
          constraintId: constraint.constraintId,
          automaticResolution: {
            resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
            method: 'nearest_feature_match',
            sourceSampleIds: [seeker.sampleId, hider.sampleId],
            sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
            sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
            thresholdMeters: 0,
            referenceFeatureId: seekerLandmass.featureId,
            ...datasetProvenance
          },
          constraintMetadata: {
            featureData: features,
            ...datasetProvenance,
            featureDataCoverage: dataset.coverage,
            gridResolutionMeters: 250,
            landmassReferenceFeatureId: seekerLandmass.featureId,
            nestedLandmassFeatureIds
          }
        };
      }
      const seekerNearest = nearestFeatureHasConfidentMargin({
        features,
        featureClassIds,
        point: [seeker.longitude, seeker.latitude],
        accuracyMeters: seeker.accuracyMeters!
      });
      const hiderNearest = nearestFeatureHasConfidentMargin({
        features,
        featureClassIds,
        point: [hider.longitude, hider.latitude],
        accuracyMeters: hider.accuracyMeters!
      });
      if (seekerNearest.ambiguous || hiderNearest.ambiguous) {
        return {
          kind: 'blocked',
          code: 'LOCATION_ANSWER_AMBIGUOUS',
          message: 'GPS uncertainty overlaps the nearest matching feature boundary. Refresh both locations before asking this question.'
        };
      }
      if (!seekerNearest.feature || !hiderNearest.feature) {
        return {
          kind: 'resolved',
          answer: { value: null },
          automaticResolution: {
            resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
            method: category.resolverKind,
            sourceSampleIds: [seeker.sampleId, hider.sampleId],
            sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
            sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
            thresholdMeters: 0,
            ...datasetProvenance
          }
        };
      }
      const compareValue = template.featureClassRefs?.some((feature) => feature.featureClassId === 'stations-name-length')
        ? Array.from(seekerNearest.feature.label.trim().normalize('NFC')).length ===
          Array.from(hiderNearest.feature.label.trim().normalize('NFC')).length
        : seekerNearest.feature.featureId === hiderNearest.feature.featureId;
      return {
        kind: 'resolved',
        answer: { value: compareValue ? 'yes' : 'no' },
        constraintId: constraint.constraintId,
        automaticResolution: {
          resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
          method: category.resolverKind,
          sourceSampleIds: [seeker.sampleId, hider.sampleId],
          sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
          sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
          thresholdMeters: 0,
          referenceFeatureId: seekerNearest.feature.featureId,
          ...datasetProvenance
        },
        constraintMetadata: {
          featureData: features,
          featureDatasetSource: dataset.source,
          featureDatasetVersion: dataset.sourceVersion,
          featureDatasetRetrievedAt: dataset.retrievedAt,
          featureDataCoverage: dataset.coverage,
          gridResolutionMeters: 250
        }
      };
    }

    const seekerNearest = queryNearestFeature({ features, featureClassIds, point: [seeker.longitude, seeker.latitude] });
    if (!seekerNearest.feature || typeof seekerNearest.distanceMeters !== 'number') {
      return {
        kind: 'resolved',
        answer: { value: null },
        automaticResolution: {
          resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
          method: category.resolverKind,
          sourceSampleIds: [seeker.sampleId, hider.sampleId],
          sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
          sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
          thresholdMeters: 0,
          ...datasetProvenance
        }
      };
    }
    const seekerDistance = distanceToFeatureMeters([seeker.longitude, seeker.latitude], seekerNearest.feature);
    const hiderDistance = distanceToFeatureMeters([hider.longitude, hider.latitude], seekerNearest.feature);
    if (seekerDistance === undefined || hiderDistance === undefined) return { kind: 'manual' };
    const distanceDelta = hiderDistance - seekerDistance;
    const uncertaintyMeters = seeker.accuracyMeters! + hider.accuracyMeters!;
    if (Math.abs(distanceDelta) <= uncertaintyMeters) {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty cannot distinguish closer from further for this feature. Refresh both locations and try again.'
      };
    }
    return {
      kind: 'resolved',
      answer: { value: distanceDelta < 0 ? 'closer' : 'further' },
      constraintId: constraint.constraintId,
      automaticResolution: {
        resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
        method: category.resolverKind,
        sourceSampleIds: [seeker.sampleId, hider.sampleId],
        sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
        sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
        thresholdMeters: uncertaintyMeters,
        referenceFeatureId: seekerNearest.feature.featureId,
        ...datasetProvenance
      },
      constraintMetadata: {
        featureData: features,
        referenceFeatureId: seekerNearest.feature.featureId,
        featureDatasetSource: dataset.source,
        featureDatasetVersion: dataset.sourceVersion,
        featureDatasetRetrievedAt: dataset.retrievedAt,
        featureDataCoverage: dataset.coverage,
        gridResolutionMeters: 250
      }
    };
  }

  if (category.resolverKind === 'nearest_candidate') {
    const dataset = args.questionFeatureDataset;
    const featureClassIds = (template.featureClassRefs ?? []).map((feature) => feature.featureClassId);
    const features = dataset ? toGeoFeatureRecords(dataset) : [];
    const threshold = numericPolicy(
      (template.parameters?.distanceThreshold as { meters?: number } | undefined)?.meters,
      0
    );
    const constraintRefs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
    const constraint = contentPack.constraints.find((candidate) =>
      constraintRefs.has(candidate.constraintId) && candidate.kind === 'nearest_candidate');
    if (!dataset || featureClassIds.length === 0 || threshold <= 0 || !constraint) return { kind: 'manual' };

    const seekerPoint: [number, number] = [seeker.longitude, seeker.latitude];
    const hiderPoint: [number, number] = [hider.longitude, hider.latitude];
    const reachUncertaintyMeters = seeker.accuracyMeters! + hider.accuracyMeters!;
    const hiderFromSeekerMeters = distanceMeters(seekerPoint, hiderPoint);
    const datasetProvenance = {
      featureDatasetSource: dataset.source,
      featureDatasetVersion: dataset.sourceVersion,
      featureDatasetRetrievedAt: dataset.retrievedAt
    };
    if (hiderFromSeekerMeters - reachUncertaintyMeters > threshold) {
      return {
        kind: 'resolved',
        answer: { value: null, reason: 'not_within_reach' },
        automaticResolution: {
          resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
          method: 'nearest_candidate',
          sourceSampleIds: [seeker.sampleId, hider.sampleId],
          sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
          sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
          thresholdMeters: threshold,
          ...datasetProvenance
        }
      };
    }
    if (hiderFromSeekerMeters + reachUncertaintyMeters > threshold) {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty overlaps the Tentacles reach boundary. Refresh both locations before asking this question.'
      };
    }

    const candidateFeatures = features.filter((feature) => {
      if (!featureClassIds.includes(feature.featureClassId)) return false;
      const distance = distanceToFeatureMeters(seekerPoint, feature);
      return typeof distance === 'number' && distance <= threshold;
    });
    if (candidateFeatures.length === 0) return { kind: 'manual' };
    const closest = queryClosestAmongCandidates({ candidates: candidateFeatures, point: hiderPoint });
    if (!closest.feature) return { kind: 'manual' };
    const ranked = closest.rankedCandidates;
    const closestDistance = ranked[0]?.distanceMeters;
    const secondDistance = ranked[1]?.distanceMeters;
    if (typeof closestDistance !== 'number' ||
      (typeof secondDistance === 'number' && secondDistance - closestDistance <= hider.accuracyMeters! * 2)) {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty overlaps the nearest Tentacles candidate. Refresh the hider location before asking this question.'
      };
    }
    return {
      kind: 'resolved',
      answer: { value: closest.feature.label, selectedFeatureId: closest.feature.featureId },
      constraintId: constraint.constraintId,
      automaticResolution: {
        resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
        method: 'nearest_candidate',
        sourceSampleIds: [seeker.sampleId, hider.sampleId],
        sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
        sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
        thresholdMeters: threshold,
        referenceFeatureId: closest.feature.featureId,
        ...datasetProvenance
      },
      constraintMetadata: {
        featureData: features,
        featureDatasetSource: dataset.source,
        featureDatasetVersion: dataset.sourceVersion,
        featureDatasetRetrievedAt: dataset.retrievedAt,
        featureDataCoverage: dataset.coverage,
        candidateFeatureIds: candidateFeatures.map((feature) => feature.featureId),
        gridResolutionMeters: 250
      }
    };
  }

  if (category.resolverKind === 'hotter_colder') {
    const requiredTravelMeters = Number(
      template.resolverConfig?.minimumDistanceMeters ??
      (template.parameters?.minimumDistance as { meters?: unknown } | undefined)?.meters
    );
    if (!Number.isFinite(requiredTravelMeters) || requiredTravelMeters <= 0) return { kind: 'manual' };

    const seekerHistory = aggregate.locationSamples
      .filter((sample) => sample.playerId === args.askedByPlayerId && sample.role === 'seeker' &&
        aggregate.roleAssignments[sample.playerId]?.role === 'seeker' && sample.source === 'device')
      .sort((left, right) => left.recordedAt.localeCompare(right.recordedAt));
    const seekStartedAt = aggregate.eventLog
      .filter((event) => event.type === 'hide_phase_ended')
      .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt))
      .at(-1)?.occurredAt;
    const currentRoundHistory = seekStartedAt
      ? seekerHistory.filter((sample) => sample.recordedAt >= seekStartedAt)
      : seekerHistory;
    const lastResolvedThermometer = Object.values(aggregate.questionInstances)
      .filter((question) => question.categoryId === category.categoryId && question.askedByPlayerId === args.askedByPlayerId && question.status === 'resolved')
      .sort((left, right) => (left.resolvedAt ?? left.askedAt).localeCompare(right.resolvedAt ?? right.askedAt))
      .at(-1);
    const previousEndId = lastResolvedThermometer?.automaticResolution?.movementEndSampleId;
    const previousEndAt = previousEndId
      ? currentRoundHistory.find((sample) => sample.sampleId === previousEndId)?.recordedAt
      : lastResolvedThermometer?.resolvedAt;
    const eligibleStarts = currentRoundHistory.filter((sample) =>
      sample.sampleId !== seeker.sampleId && (!previousEndAt || sample.recordedAt > previousEndAt));
    const candidateStarts = [...eligibleStarts].reverse().flatMap((sample) => {
      if (typeof sample.accuracyMeters !== 'number' || sample.accuracyMeters < 0 || sample.accuracyMeters > maxAccuracyMeters) return [];
      const distance = distanceMeters([sample.longitude, sample.latitude], [seeker.longitude, seeker.latitude]);
      return [{ sample, distance, minimumDistance: distance - sample.accuracyMeters - seeker.accuracyMeters! }];
    });
    const start = candidateStarts.find((candidate) => candidate.minimumDistance >= requiredTravelMeters)?.sample;

    if (!start) {
      if (candidateStarts.some((candidate) => candidate.distance + candidate.sample.accuracyMeters! + seeker.accuracyMeters! >= requiredTravelMeters)) {
        return {
          kind: 'blocked',
          code: 'LOCATION_ANSWER_AMBIGUOUS',
          message: 'GPS uncertainty overlaps the Thermometer travel minimum. Refresh your locations after traveling farther.'
        };
      }
      return {
        kind: 'blocked',
        code: 'TRAVEL_DISTANCE_REQUIRED',
        message: `Travel at least ${Math.round(requiredTravelMeters / 100) / 10} km from your last Thermometer point before asking this question.`
      };
    }

    const startAccuracy = start.accuracyMeters;
    const endAccuracy = seeker.accuracyMeters;
    if (typeof startAccuracy !== 'number' || typeof endAccuracy !== 'number') {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty overlaps the Thermometer travel minimum. Refresh your locations after traveling farther.'
      };
    }

    const startToHider = distanceMeters([start.longitude, start.latitude], [hider.longitude, hider.latitude]);
    const endToHider = distanceMeters([seeker.longitude, seeker.latitude], [hider.longitude, hider.latitude]);
    const distanceChange = startToHider - endToHider;
    const comparisonUncertainty = startAccuracy + endAccuracy + 2 * (hider.accuracyMeters ?? maxAccuracyMeters);
    if (Math.abs(distanceChange) <= comparisonUncertainty) {
      return {
        kind: 'blocked',
        code: 'LOCATION_ANSWER_AMBIGUOUS',
        message: 'GPS uncertainty cannot tell whether the seekers became hotter or colder. Refresh the location fixes and try again.'
      };
    }

    const refs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
    const constraint = contentPack.constraints.find((candidate) => refs.has(candidate.constraintId) && candidate.kind === 'hotter_colder');
    if (!constraint) return { kind: 'manual' };
    return {
      kind: 'resolved',
      answer: { value: distanceChange > 0 ? 'hotter' : 'colder' },
      constraintId: constraint.constraintId,
      automaticResolution: {
        resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
        method: 'hotter_colder',
        sourceSampleIds: [start.sampleId, seeker.sampleId, hider.sampleId],
        sourceRecordedAt: [start.recordedAt, seeker.recordedAt, hider.recordedAt],
        sourceAccuracyMeters: [startAccuracy, endAccuracy, hider.accuracyMeters ?? maxAccuracyMeters],
        thresholdMeters: requiredTravelMeters,
        movementStartSampleId: start.sampleId,
        movementEndSampleId: seeker.sampleId
      }
    };
  }

  const thresholdMeters = Number(
    template.resolverConfig?.thresholdMeters ??
    (template.parameters?.distanceThreshold as { meters?: unknown } | undefined)?.meters ??
    args.chosenDistanceMeters
  );
  if (!Number.isFinite(thresholdMeters) || thresholdMeters <= 0) {
    return { kind: 'manual' };
  }

  const distance = distanceMeters([seeker.longitude, seeker.latitude], [hider.longitude, hider.latitude]);
  const combinedAccuracy = seeker.accuracyMeters! + hider.accuracyMeters!;
  if (distance - combinedAccuracy <= thresholdMeters && distance + combinedAccuracy > thresholdMeters) {
    return {
      kind: 'blocked',
      code: 'LOCATION_ANSWER_AMBIGUOUS',
      message: 'The location accuracy overlaps the Radar boundary. Refresh both GPS fixes before resolving this question.'
    };
  }

  const within = distance + combinedAccuracy <= thresholdMeters;
  const refs = new Set([...(template.constraintRefs ?? []), ...(category.defaultConstraintRefs ?? [])]);
  const constraint = contentPack.constraints.find((candidate) =>
    refs.has(candidate.constraintId) && candidate.kind === (within ? 'within_distance' : 'beyond_distance'));
  if (!constraint) return { kind: 'manual' };

  return {
    kind: 'resolved',
    answer: { value: within ? 'yes' : 'no' },
    constraintId: constraint.constraintId,
    automaticResolution: {
      resolverVersion: AUTOMATIC_QUESTION_RESOLVER_VERSION,
      method: 'threshold_distance',
      sourceSampleIds: [seeker.sampleId, hider.sampleId],
      sourceRecordedAt: [seeker.recordedAt, hider.recordedAt],
      sourceAccuracyMeters: [seeker.accuracyMeters!, hider.accuracyMeters!],
      thresholdMeters
    }
  };
}
