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

function readPromptOverride(template: QuestionTemplateDefinition): string | undefined {
  const promptOverrides = template.promptOverrides;
  if (!promptOverrides) {
    return undefined;
  }

  const candidateKeys = ['prompt', 'promptTemplate', 'question', 'text'];
  for (const key of candidateKeys) {
    const value = promptOverrides[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }

  const firstString = Object.values(promptOverrides).find(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );
  return firstString?.trim();
}

function fillPromptTemplate(
  promptTemplate: string,
  template: QuestionTemplateDefinition,
  category: QuestionCategoryDefinition
): string {
  const featureLabel = getFeatureLabel(template);
  const distanceLabel = getDistanceLabel(template) ?? 'the chosen distance';
  const promptSubject = featureLabel === template.name ? featureLabel : featureLabel;

  return promptTemplate
    .replace(/\[Distance\]/gi, distanceLabel)
    .replace(/\[Places\]/gi, featureLabel)
    .replace(/\[subject\]/gi, promptSubject)
    .replace(/_{3,}/g, featureLabel)
    .replace(/\s+/g, ' ')
    .trim()
    || category.promptTemplate.trim();
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
  if (category.promptTemplate.trim().length > 0) {
    return `Questions in this group sound like: "${category.promptTemplate.trim()}"`;
  }

  switch (category.resolverKind) {
    case 'nearest_feature_match':
      return 'Compare the nearest matching place for the seeker and the hider.';
    case 'comparative_distance':
      return 'Work out who is closer to the same kind of place.';
    case 'hotter_colder':
      return 'Use the seeker movement trail to judge whether the hider is getting hotter or colder.';
    case 'threshold_distance':
      return 'Ask whether the hider is inside or outside a chosen distance from the seeker.';
    case 'nearest_candidate':
      return 'Pick which nearby candidate place is closest to the hider.';
    case 'photo_challenge':
      return 'Record photo evidence or a referee-reviewed clue instead of relying on geometry alone.';
    default:
      return 'Use this category to record a clue about the hider.';
  }
}

export function buildQuestionPromptPreview(
  template: QuestionTemplateDefinition,
  category: QuestionCategoryDefinition
): string | undefined {
  const promptOverride = readPromptOverride(template);
  if (promptOverride) {
    return fillPromptTemplate(promptOverride, template, category);
  }

  if (category.promptTemplate.trim().length > 0) {
    return fillPromptTemplate(category.promptTemplate, template, category);
  }

  return undefined;
}

export function describeQuestionTemplateForPlayers(
  template: QuestionTemplateDefinition,
  category: QuestionCategoryDefinition
): string {
  const workbookPrompt = buildQuestionPromptPreview(template, category);
  if (workbookPrompt) {
    return workbookPrompt;
  }

  const featureLabel = getFeatureLabel(template);
  const distanceLabel = getDistanceLabel(template);

  switch (category.resolverKind) {
    case 'nearest_feature_match':
      return `Compare the nearest ${featureLabel} for the seeker and the hider.`;
    case 'comparative_distance':
      return `Check whether the hider is closer to ${featureLabel} than the seeker is.`;
    case 'hotter_colder':
      return distanceLabel
        ? `Use seeker movement after traveling about ${distanceLabel} to answer hotter or colder.`
        : 'Use seeker movement history to answer hotter or colder.';
    case 'threshold_distance':
      return distanceLabel
        ? `Ask whether the hider is within ${distanceLabel} of the seeker.`
        : 'Ask whether the hider is within the selected distance of the seeker.';
    case 'nearest_candidate':
      return distanceLabel
        ? `Choose which nearby ${featureLabel} within about ${distanceLabel} is closest to the hider.`
        : `Choose which nearby ${featureLabel} is closest to the hider.`;
    case 'photo_challenge':
      return `Record photo or manual evidence for ${featureLabel}.`;
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
      return 'Reply with a simple Yes or No.';
    case 'enum':
      return allowedValues.length > 0
        ? `Choose one clear answer: ${joinList(allowedValues)}.`
        : 'Choose the option that best matches the real answer.';
    case 'feature_choice':
      return 'Pick the place that honestly matches best. If the list looks incomplete, enter the closest real match you can.';
    case 'attachment':
      return 'Attach one or more evidence photos, then add a short note if the picture needs context or later review.';
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

  if (
    args.category.resolverKind === 'photo_challenge' ||
    /evidence|recorded without a map update/i.test(support)
  ) {
    return {
      label: 'Evidence only',
      tone: 'info',
      detail: 'This records evidence or manual review notes honestly. It should not be expected to change the map by itself.'
    };
  }

  if (
    args.category.resolverKind === 'threshold_distance' ||
    args.category.resolverKind === 'hotter_colder' ||
    args.category.resolverKind === 'nearest_feature_match' ||
    args.category.resolverKind === 'comparative_distance' ||
    args.category.resolverKind === 'nearest_candidate'
  ) {
    return {
      label: 'Approximate map update',
      tone: 'warning',
      detail: args.category.resolverKind === 'hotter_colder'
        ? 'This usually narrows the map from movement history, but the resulting shape should still be treated carefully unless the final result comes back exact.'
        : 'This question is expected to narrow or annotate the map, but the resulting shape should be treated as approximate.'
    };
  }

  return {
    label: 'Exact map update',
    tone: 'success',
    detail: 'This question is expected to update the map directly inside the active playable region.'
  };
}
