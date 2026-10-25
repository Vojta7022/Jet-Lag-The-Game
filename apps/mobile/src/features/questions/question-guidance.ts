import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  ScaleKey
} from '../../../../../packages/shared-types/src/index.ts';

import type { ResolutionTone } from './question-result-model.ts';

import { describeTemplateSupport } from './question-flow-state.ts';
import { hasOpenStreetMapFeatureClass } from '../../../../../packages/geo/src/index.ts';

export function requiresMovingTransitConfirmation(template: QuestionTemplateDefinition): boolean {
  return (template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'transit-line');
}

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
    : typeof parameters.targetLabel === 'string'
      ? parameters.targetLabel
      : typeof parameters.placeLabel === 'string'
        ? parameters.placeLabel
    : typeof parameters.subject === 'string'
      ? parameters.subject
      : undefined;

  return subject ?? template.name;
}

function readWorkbookParameterText(template: QuestionTemplateDefinition, key: string): string | undefined {
  const parameters = template.parameters ?? {};
  const value = parameters[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
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

export function describeWorkbookAvailability(template: QuestionTemplateDefinition): string {
  const explicitAvailability = readWorkbookParameterText(template, 'workbookAvailabilityText');
  if (explicitAvailability) {
    return explicitAvailability;
  }

  return template.scaleSet.rawLabel?.trim() || formatQuestionScaleSet(template.scaleSet.appliesTo);
}

export function describeWorkbookRuleSummary(
  template: QuestionTemplateDefinition,
  category: QuestionCategoryDefinition
): string {
  const cost = readWorkbookParameterText(template, 'workbookCostText') ?? category.drawRule.rawText.trim();
  const time = readWorkbookParameterText(template, 'workbookTimeText');
  const availability = describeWorkbookAvailability(template);
  const values = [cost, time, availability].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  return values.join(' · ');
}

export function describeWorkbookRequirementSummary(template: QuestionTemplateDefinition): string | undefined {
  if (template.categoryId === 'photos' && describeQuestionRulebookGuidance(template)) {
    return undefined;
  }
  const workbookRequirement = readWorkbookParameterText(template, 'workbookRequirementsText');
  if (workbookRequirement) {
    return workbookRequirement;
  }

  const manualRequirement = template.requirements?.find((requirement) => requirement.requirementType === 'manual_approval');
  return manualRequirement?.description?.trim() || undefined;
}

export function describeQuestionRulebookGuidance(template: QuestionTemplateDefinition): string | undefined {
  return readWorkbookParameterText(template, 'rulebookGuidanceText');
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

export function describeExpectedAnswerGuidance(
  template: QuestionTemplateDefinition,
  category?: QuestionCategoryDefinition
): string {
  if (category && category.answerPolicy !== 'manual' && category.resolverKind === 'comparative_distance' &&
    (template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'sea-level')) {
    return 'When connected, the app compares fresh seeker and hider locations with a 90 m Copernicus elevation surface and narrows the map when the height difference is clear. Buildings and vegetation can affect the model; close or uncertain readings stay available for a manual answer. Source: Open-Meteo and Copernicus DEM GLO-90.';
  }
  if (category?.resolverKind === 'threshold_distance' && category.answerPolicy !== 'manual') {
    return 'The app calculates Yes or No from fresh GPS locations for the hider and asking seeker.';
  }
  if (
    category && category.answerPolicy !== 'manual' &&
    (category.resolverKind === 'nearest_feature_match' || category.resolverKind === 'comparative_distance' || category.resolverKind === 'nearest_candidate') &&
    (template.featureClassRefs ?? []).length > 0 &&
    (template.featureClassRefs ?? []).every((feature) => hasOpenStreetMapFeatureClass(feature.featureClassId))
  ) {
    if ((template.featureClassRefs ?? []).some((feature) => /^(?:[1-4](?:st|nd|rd|th)-admin-|a-[1-4](?:st|nd|rd|th)-admin-border-)/.test(feature.featureClassId))) {
      if ((template.featureClassRefs ?? []).some((feature) => /^a-[1-4](?:st|nd|rd|th)-admin-border-/.test(feature.featureClassId))) {
        return 'When connected, the app compares both fresh locations to a mapped border shared by divisions at the requested level, then narrows the map. If the border is missing or too close to distinguish, it asks for a manual ruling.';
      }
      return 'When connected, the app compares both fresh locations against OpenStreetMap administrative boundaries and narrows the map to that division. If the required level is missing or GPS overlaps a border, it asks for a manual ruling.';
    }
    if ((template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'a-body-of-water')) {
      return 'When connected, the app compares both fresh locations to the nearest mapped named water area or river line, then narrows the map around that same feature. Swimming pools are excluded; incomplete features stay manual, and river lines are approximate.';
    }
    if ((template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'metro-lines')) {
      return 'When connected, the app uses mapped subway routes within the seeker’s reach, finds the route line nearest to the hider, and narrows the map around that route. Incomplete route geometry stays manual.';
    }
    if ((template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'a-coastline')) {
      return 'When connected, the app compares both fresh locations to mapped ocean-coastline lines and narrows the search map to that coastline. This does not cover great-lake shorelines or waterways at least 2 km wide; agree on manual handling for those map areas before asking.';
    }
    if ((template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'an-international-border')) {
      return 'When connected, the app compares both fresh locations with mapped international borders inside the playable map, including borders around enclaves, then narrows the search map. Missing or ambiguous border data stays manual.';
    }
    if ((template.featureClassRefs ?? []).some((feature) => feature.featureClassId === 'street-or-path')) {
      return 'When connected, the app compares both fresh locations with mapped street and path segments, then narrows the search map to the seeker’s nearest segment. Unnamed paths split at mapped intersections; missing map data stays manual.';
    }
    return category.resolverKind === 'nearest_candidate'
      ? 'When connected, the app checks the seeker reach radius, then finds the reachable place closest to the hider using fresh GPS and OpenStreetMap data.'
      : 'When connected, the app answers from fresh GPS locations for both players and OpenStreetMap places in the selected region.';
  }

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
