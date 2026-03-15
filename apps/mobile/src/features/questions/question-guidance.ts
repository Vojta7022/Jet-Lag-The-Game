import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey
} from '../../../../../packages/shared-types/src/index.ts';

import type { ResolutionTone } from './question-result-model.ts';

import { describeTemplateSupport } from './question-flow-state.ts';

function joinList(values: string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0]!;
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function getFeatureLabel(template: QuestionTemplateDefinition): string {
  const labels = (template.featureClassRefs ?? [])
    .map((feature) => feature.label?.trim())
    .filter((value): value is string => Boolean(value));

  if (labels.length > 0) {
    return joinList(labels);
  }

  const parameters = template.parameters ?? {};
  const subject = typeof parameters.subjectLabel === 'string'
    ? parameters.subjectLabel
    : typeof parameters.subject === 'string'
      ? parameters.subject
      : undefined;

  return subject ?? template.name;
}

function getDistanceLabel(template: QuestionTemplateDefinition): string | undefined {
  const parameters = template.parameters ?? {};
  const threshold = parameters.distanceThreshold as
    | {
        metricText?: string;
        milesText?: string;
        rawText?: string;
      }
    | undefined;

  if (!threshold) {
    return undefined;
  }

  if (threshold.metricText && threshold.milesText) {
    return `${threshold.metricText} (${threshold.milesText})`;
  }

  return threshold.metricText ?? threshold.milesText ?? threshold.rawText;
}

function formatScaleLabel(scale: ScaleKey): string {
  switch (scale) {
    case 'small':
      return 'small';
    case 'medium':
      return 'medium';
    case 'large':
      return 'large';
  }
}

export interface QuestionImpactExpectation {
  label: string;
  tone: ResolutionTone;
  detail: string;
}

export function formatQuestionScaleSet(appliesTo: ScaleKey[]): string {
  const labels = appliesTo.map(formatScaleLabel);

  if (labels.length === 3) {
    return 'Small, medium, and large games';
  }

  return `${joinList(labels)} games`;
}

export function describeQuestionCategoryForPlayers(category: QuestionCategoryDefinition): string {
  switch (category.resolverKind) {
    case 'nearest_feature_match':
      return 'Compare the nearest matching place for both sides.';
    case 'comparative_distance':
      return 'Compare which side is closer to the same kind of place.';
    case 'hotter_colder':
      return 'Use seeker movement history to say whether the hider is getting hotter or colder.';
    case 'threshold_distance':
      return 'Ask whether the hider is inside or outside a chosen distance from the seeker.';
    case 'nearest_candidate':
      return 'Choose which nearby candidate place is closest to the hider.';
    case 'photo_challenge':
      return 'Record evidence with photos or manual review instead of relying on geometry alone.';
    default:
      return 'Use this category to record a clue about the hider.';
  }
}

export function describeQuestionTemplateForPlayers(
  template: QuestionTemplateDefinition,
  category: QuestionCategoryDefinition
): string {
  const featureLabel = getFeatureLabel(template);
  const distanceLabel = getDistanceLabel(template);

  switch (category.resolverKind) {
    case 'nearest_feature_match':
      return `Compare the nearest ${featureLabel} for both sides.`;
    case 'comparative_distance':
      return `Compare whether the hider is closer to ${featureLabel} than the seeker is.`;
    case 'hotter_colder':
      return distanceLabel
        ? `Use seeker movement after traveling about ${distanceLabel} to answer hotter or colder.`
        : 'Use seeker movement history to answer hotter or colder.';
    case 'threshold_distance':
      return distanceLabel
        ? `Check whether the hider is within ${distanceLabel} of the seeker.`
        : `Check whether the hider is within the selected distance of the seeker.`;
    case 'nearest_candidate':
      return distanceLabel
        ? `Choose which nearby ${featureLabel} within about ${distanceLabel} is closest to the hider.`
        : `Choose which nearby ${featureLabel} is closest to the hider.`;
    case 'photo_challenge':
      return `Record manual evidence for ${featureLabel}.`;
    default:
      return template.name;
  }
}

export function describeExpectedAnswerGuidance(template: QuestionTemplateDefinition): string {
  const answerKind = String(template.answerSchema.kind ?? 'manual');
  const allowedValues = Array.isArray(template.answerSchema.allowedValues)
    ? template.answerSchema.allowedValues.filter((value): value is string => typeof value === 'string')
    : Array.isArray(template.answerSchema.values)
      ? template.answerSchema.values.filter((value): value is string => typeof value === 'string')
      : [];

  switch (answerKind) {
    case 'boolean':
      return 'Answer Yes or No.';
    case 'enum':
      return allowedValues.length > 0
        ? `Choose one of: ${joinList(allowedValues)}.`
        : 'Choose the option that best matches the real answer.';
    case 'feature_choice':
      return 'Pick the closest matching place from the list. If the list is incomplete, enter the best honest match.';
    case 'attachment':
      return 'Record one or more attachment placeholders and add a short note for manual evidence review.';
    default:
      return 'Record the answer honestly using the available information.';
  }
}

export function describeQuestionImpactExpectation(args: {
  template: QuestionTemplateDefinition;
  category: QuestionCategoryDefinition;
  regionId?: string;
}): QuestionImpactExpectation {
  const support = describeTemplateSupport(args);

  if (args.category.resolverKind === 'photo_challenge' || support.startsWith('Metadata-only')) {
    return {
      label: 'Metadata-only',
      tone: 'info',
      detail: 'This records evidence or manual review notes. It does not promise a map change.'
    };
  }

  if (args.category.resolverKind === 'hotter_colder') {
    return {
      label: 'Exact or approximate update',
      tone: 'warning',
      detail: 'This usually narrows the map using movement history, but the result can still be approximate.'
    };
  }

  if (support.includes('Approximate')) {
    return {
      label: 'Approximate map update',
      tone: 'warning',
      detail: 'This usually changes the map, but the resulting area should be treated as approximate.'
    };
  }

  return {
    label: 'Map update',
    tone: 'success',
    detail: 'This question is expected to update the map inside the active playable region.'
  };
}
