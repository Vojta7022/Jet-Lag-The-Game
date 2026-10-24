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
  queryClosestAmongCandidates,
  queryNearestFeature,
  type GeoFeatureRecord
} from '../../../geo/src/index.ts';

export const AUTOMATIC_QUESTION_RESOLVER_VERSION = 'jetlag-location-v1';
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
    geometrySupport: feature.geometrySupport,
    coverage: feature.coverage,
    properties: feature.properties
  }));
}

function nearestFeatureHasConfidentMargin(args: {
  features: GeoFeatureRecord[];
  featureClassIds: string[];
  point: [number, number];
  accuracyMeters: number;
}): { feature?: GeoFeatureRecord; ambiguous: boolean } {
  const ranked = args.features
    .filter((feature) => args.featureClassIds.includes(feature.featureClassId) && feature.representativePoint)
    .map((feature) => ({
      feature,
      distance: distanceMeters(
        args.point,
        [feature.representativePoint!.longitude, feature.representativePoint!.latitude]
      )
    }))
    .sort((left, right) => left.distance - right.distance);
  const nearest = ranked[0];
  const second = ranked[1];
  return {
    feature: nearest?.feature,
    ambiguous: Boolean(nearest && second && second.distance - nearest.distance <= args.accuracyMeters * 2)
  };
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
  if (
    (category.resolverKind === 'nearest_feature_match' || category.resolverKind === 'comparative_distance' || category.resolverKind === 'nearest_candidate') &&
    (!args.questionFeatureDataset ||
      (template.featureClassRefs ?? []).length === 0 ||
      !args.questionFeatureDataset.features.some((feature) =>
        (template.featureClassRefs ?? []).some((reference) => reference.featureClassId === feature.featureClassId)))
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
    const reference = seekerNearest.feature.representativePoint
      ? [seekerNearest.feature.representativePoint.longitude, seekerNearest.feature.representativePoint.latitude] as [number, number]
      : undefined;
    if (!reference) return { kind: 'manual' };
    const seekerDistance = distanceMeters([seeker.longitude, seeker.latitude], reference);
    const hiderDistance = distanceMeters([hider.longitude, hider.latitude], reference);
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

    const candidateFeatures = features.filter((feature) =>
      featureClassIds.includes(feature.featureClassId) && feature.representativePoint &&
      distanceMeters(seekerPoint, [feature.representativePoint.longitude, feature.representativePoint.latitude]) <= threshold);
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
