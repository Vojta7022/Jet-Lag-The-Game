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
  | { kind: 'blocked'; code: 'LOCATION_FIX_REQUIRED' | 'LOCATION_ANSWER_AMBIGUOUS'; message: string }
  | {
      kind: 'resolved';
      answer: Record<string, unknown>;
      constraintId: string;
      automaticResolution: {
        resolverVersion: string;
        method: 'threshold_distance';
        sourceSampleIds: string[];
        sourceRecordedAt: string[];
        sourceAccuracyMeters: number[];
        thresholdMeters: number;
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
  if (category.answerPolicy === 'manual' || category.resolverKind !== 'threshold_distance') return { kind: 'manual' };

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
