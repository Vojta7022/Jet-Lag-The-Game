import type {
  ContentPack,
  LocationSampleModel,
  MatchAggregate,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../shared-types/src/index.ts';
import { distanceMeters } from '../../../geo/src/index.ts';

export const AUTOMATIC_QUESTION_RESOLVER_VERSION = 'jetlag-location-v1';
const DEFAULT_MAX_FIX_AGE_SECONDS = 30;
const DEFAULT_MAX_FIX_ACCURACY_METERS = 50;

export type AutomaticQuestionAnswerResult =
  | { kind: 'manual' }
  | { kind: 'blocked'; code: 'LOCATION_FIX_REQUIRED' | 'LOCATION_ANSWER_AMBIGUOUS' | 'TRAVEL_DISTANCE_REQUIRED'; message: string }
  | {
      kind: 'resolved';
      answer: Record<string, unknown>;
      constraintId: string;
      automaticResolution: {
        resolverVersion: string;
        method: 'threshold_distance' | 'hotter_colder';
        sourceSampleIds: string[];
        sourceRecordedAt: string[];
        sourceAccuracyMeters: number[];
        thresholdMeters: number;
        movementStartSampleId?: string;
        movementEndSampleId?: string;
      };
    };

function latestSample(samples: LocationSampleModel[], predicate: (sample: LocationSampleModel) => boolean) {
  return samples.filter(predicate).sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))[0];
}

function numericPolicy(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveAutomaticQuestionAnswer(args: {
  aggregate: MatchAggregate;
  contentPack: ContentPack;
  category: QuestionCategoryDefinition;
  template: QuestionTemplateDefinition;
  askedByPlayerId: string;
  targetTeamId?: string;
  occurredAt: string;
}): AutomaticQuestionAnswerResult {
  const { aggregate, contentPack, category, template } = args;
  if (category.answerPolicy === 'manual') return { kind: 'manual' };
  if (category.resolverKind !== 'threshold_distance' && category.resolverKind !== 'hotter_colder') return { kind: 'manual' };

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
    (template.parameters?.distanceThreshold as { meters?: unknown } | undefined)?.meters
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
