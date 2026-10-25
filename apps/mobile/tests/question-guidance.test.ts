import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../packages/shared-types/src/index.ts';

import {
  buildQuestionPromptPreview,
  describeExpectedAnswerGuidance,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  describeWorkbookAvailability,
  describeQuestionRulebookGuidance,
  describeWorkbookRequirementSummary,
  describeWorkbookRuleSummary,
  formatQuestionScaleSet,
  requiresMovingTransitConfirmation
} from '../src/features/questions/question-guidance.ts';

test('Transit Line is identified as requiring the moving-transit rule confirmation', () => {
  const template = createTemplate({
    featureClassRefs: [{ featureClassId: 'transit-line', label: 'Transit Line', rawLabel: 'Transit Line' }]
  });
  assert.equal(requiresMovingTransitConfirmation(template), true);
  assert.equal(requiresMovingTransitConfirmation(createTemplate()), false);
});

function createCategory(
  overrides: Partial<QuestionCategoryDefinition> = {}
): QuestionCategoryDefinition {
  return {
    categoryId: 'category-1',
    packId: 'pack-1',
    name: 'Radar',
    resolverKind: 'threshold_distance',
    promptTemplate: 'Are you within [Distance] of me?',
    drawRule: {
      drawCount: 1,
      pickCount: 1,
      rawText: 'Draw 1'
    },
    defaultTimerPolicy: {
      kind: 'fixed',
      durationSeconds: 30
    },
    defaultAnswerSchema: {
      kind: 'boolean'
    },
    visibilityPolicy: {
      visibleTo: ['public_match']
    },
    scaleSet: {
      appliesTo: ['small', 'medium', 'large']
    },
    defaultConstraintRefs: ['within-radius'],
    sourceProvenance: [],
    ...overrides
  };
}

function createTemplate(
  overrides: Partial<QuestionTemplateDefinition> = {}
): QuestionTemplateDefinition {
  return {
    templateId: 'template-1',
    packId: 'pack-1',
    categoryId: 'category-1',
    name: '0.25mi 402m',
    parameters: {
      distanceThreshold: {
        metricText: '402m',
        milesText: '0.25mi'
      }
    },
    answerSchema: {
      kind: 'boolean',
      allowedValues: ['yes', 'no']
    },
    resolverConfig: {},
    constraintRefs: ['within-radius'],
    scaleSet: {
      appliesTo: ['small', 'medium', 'large']
    },
    visibilityPolicy: {
      visibleTo: ['public_match']
    },
    sourceProvenance: [],
    ...overrides
  };
}

test('question guidance explains approximate map updates plainly for radar templates', () => {
  const category = createCategory();
  const template = createTemplate();
  const impact = describeQuestionImpactExpectation({
    template,
    category,
    regionId: 'seed-prague-city'
  });

  assert.match(describeQuestionTemplateForPlayers(template, category), /within 402m/i);
  assert.equal(describeExpectedAnswerGuidance(template), 'Reply with a simple Yes or No.');
  assert.match(describeExpectedAnswerGuidance(template, category), /fresh GPS locations/i);
  assert.equal(describeExpectedAnswerGuidance(template, { ...category, answerPolicy: 'manual' }), 'Reply with a simple Yes or No.');
  assert.equal(impact.label, 'Approximate map update');
  assert.match(impact.detail, /narrow/i);
  assert.equal(formatQuestionScaleSet(template.scaleSet.appliesTo), 'Small, medium, and large games');
});

test('Sea Level explains automatic elevation lookup, model limits, attribution, and manual fallback', () => {
  const template = createTemplate({
    name: 'Sea Level',
    featureClassRefs: [{ featureClassId: 'sea-level', label: 'Sea Level', rawLabel: 'Sea Level' }]
  });
  const category = createCategory({
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    answerPolicy: 'automatic'
  });
  const guidance = describeExpectedAnswerGuidance(template, category);

  assert.match(guidance, /90 m Copernicus elevation surface/i);
  assert.match(guidance, /manual answer/i);
  assert.match(guidance, /Open-Meteo and Copernicus DEM GLO-90/i);
});

test('question guidance prefers imported workbook prompt templates when available', () => {
  const category = createCategory({
    categoryId: 'matching',
    name: 'Matching',
    resolverKind: 'nearest_feature_match',
    promptTemplate: 'Is your nearest _____ the same as my nearest _____?'
  });
  const template = createTemplate({
    templateId: 'matching-airport',
    categoryId: 'matching',
    name: 'Commercial Airport',
    featureClassRefs: [
      {
        featureClassId: 'commercial-airport',
        label: 'Commercial Airport',
        rawLabel: 'Commercial Airport'
      }
    ]
  });

  assert.equal(
    buildQuestionPromptPreview(template, category),
    'Is your nearest Commercial Airport the same as my nearest Commercial Airport?'
  );
});

test('question guidance surfaces workbook rule, availability, and requirement text when present', () => {
  const category = createCategory({
    categoryId: 'photos',
    name: 'Photos',
    resolverKind: 'photo_challenge',
    promptTemplate: 'Send a photo of [subject].',
    drawRule: {
      drawCount: 1,
      pickCount: 1,
      rawText: 'Draw 1'
    }
  });
  const template = createTemplate({
    templateId: 'photo-tree',
    categoryId: 'photos',
    name: 'A Tree',
    parameters: {
      subject: 'A Tree',
      workbookCostText: 'Cost 2',
      workbookTimeText: '10 minutes',
      workbookAvailabilityText: 'S/M only',
      workbookRequirementsText: 'Must include the entire tree'
    }
  });

  assert.equal(describeWorkbookRuleSummary(template, category), 'Cost 2 · 10 minutes · S/M only');
  assert.equal(describeWorkbookAvailability(template), 'S/M only');
  assert.equal(describeWorkbookRequirementSummary(template), 'Must include the entire tree');
});

test('question guidance exposes scan-derived clarifications separately from workbook requirements', () => {
  const template = createTemplate({
    parameters: {
      workbookRequirementsText: 'Send the current transit stop list.',
      rulebookGuidanceText: 'Ask only while riding moving transit. A train passing the hider station without stopping counts as No.'
    }
  });

  assert.equal(
    describeQuestionRulebookGuidance(template),
    'Ask only while riding moving transit. A train passing the hider station without stopping counts as No.'
  );
  assert.equal(describeWorkbookRequirementSummary(template), 'Send the current transit stop list.');
});

test('photo questions show scanned requirements without displaying conflicting workbook wording', () => {
  const template = createTemplate({
    templateId: 'photos-1-2-mile-of-streets-traced',
    categoryId: 'photos',
    parameters: {
      workbookRequirementsText: 'Must trace 1/2 mile of streets.',
      rulebookGuidanceText: 'Trace 1 km of streets continuously, including five turns, without doubling back.'
    }
  });

  assert.match(String(describeQuestionRulebookGuidance(template)), /1 km/);
  assert.equal(describeWorkbookRequirementSummary(template), undefined);
});

test('question guidance stays honest about metadata-only evidence flows', () => {
  const category = createCategory({
    categoryId: 'photos',
    name: 'Photos',
    resolverKind: 'photo_challenge',
    promptTemplate: 'Send a photo of [subject].',
    defaultAnswerSchema: {
      kind: 'attachment'
    },
    defaultConstraintRefs: ['photo-evidence']
  });
  const template = createTemplate({
    templateId: 'template-photo',
    categoryId: 'photos',
    name: 'A Tree',
    parameters: {
      subject: 'A Tree'
    },
    answerSchema: {
      kind: 'attachment'
    },
    constraintRefs: ['photo-evidence'],
    requirements: [
      {
        requirementType: 'photo',
        description: 'Provide a full photo.'
      }
    ]
  });

  const impact = describeQuestionImpactExpectation({
    template,
    category,
    regionId: 'seed-prague-city'
  });

  assert.match(describeQuestionTemplateForPlayers(template, category), /send a photo of a tree/i);
  assert.match(describeExpectedAnswerGuidance(template), /evidence photos/i);
  assert.equal(impact.label, 'Evidence only');
  assert.match(impact.detail, /should not be expected to change the map/i);
});

test('question guidance explains automatic regional feature answers for supported classes', () => {
  const category = createCategory({
    categoryId: 'matching',
    name: 'Matching',
    resolverKind: 'nearest_feature_match',
    promptTemplate: 'Is your nearest _____ the same as my nearest _____?',
    defaultConstraintRefs: ['nearest-feature-match']
  });
  const template = createTemplate({
    templateId: 'template-matching',
    categoryId: 'matching',
    name: 'Commercial Airport',
    featureClassRefs: [
      {
        featureClassId: 'commercial-airport',
        label: 'Commercial Airport',
        rawLabel: 'Commercial Airport'
      }
    ],
    constraintRefs: ['nearest-feature-match']
  });

  const impact = describeQuestionImpactExpectation({
    template,
    category,
    regionId: 'unknown-region'
  });

  assert.match(describeQuestionTemplateForPlayers(template, category), /commercial airport/i);
  assert.equal(impact.label, 'Approximate map update');
  assert.match(describeExpectedAnswerGuidance(template, category), /OpenStreetMap places in the selected region/i);
});

test('question guidance explains automatic Street or Path answers from mapped segment geometry', () => {
  const category = createCategory({
    categoryId: 'matching',
    name: 'Matching',
    resolverKind: 'nearest_feature_match',
    promptTemplate: 'Is your nearest _____ the same as my nearest _____?',
    defaultConstraintRefs: ['nearest-feature-match']
  });
  const template = createTemplate({
    templateId: 'matching-street-or-path',
    categoryId: 'matching',
    name: 'Street or Path',
    featureClassRefs: [{ featureClassId: 'street-or-path', label: 'Street or Path', rawLabel: 'Street or Path' }],
    constraintRefs: ['nearest-feature-match']
  });

  assert.match(describeExpectedAnswerGuidance(template, category), /mapped street and path segments/i);
  assert.match(describeExpectedAnswerGuidance(template, category), /intersection/i);
});

test('question guidance explains when administrative-border Measuring is automatic', () => {
  const category = createCategory({
    categoryId: 'measuring',
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    promptTemplate: 'Compared to me, are you closer to or further from _____?',
    defaultConstraintRefs: ['comparative-distance']
  });
  const template = createTemplate({
    templateId: 'measuring-a-1st-admin-border-state',
    categoryId: 'measuring',
    name: 'A 1st Admin Border (State)',
    featureClassRefs: [{
      featureClassId: 'a-1st-admin-border-state',
      label: 'A 1st Admin Border (State)',
      rawLabel: 'A 1st Admin Border (State)'
    }],
    constraintRefs: ['comparative-distance']
  });

  assert.match(describeExpectedAnswerGuidance(template, category), /shared by divisions at the requested level/i);
  assert.match(describeExpectedAnswerGuidance(template, category), /manual ruling/i);
});

test('High-Speed Train Line guidance explains mapped-track coverage and manual fallback', () => {
  const category = createCategory({
    categoryId: 'measuring',
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    promptTemplate: 'Compared to me, are you closer to or further from _____?',
    defaultConstraintRefs: ['comparative-distance']
  });
  const template = createTemplate({
    templateId: 'measuring-a-high-speed-train-line',
    categoryId: 'measuring',
    name: 'A High-Speed Train Line',
    featureClassRefs: [{
      featureClassId: 'a-high-speed-train-line',
      label: 'A High-Speed Train Line',
      rawLabel: 'A High-Speed Train Line'
    }]
  });

  const guidance = describeExpectedAnswerGuidance(template, category);
  assert.match(guidance, /mapped high-speed railway track/i);
  assert.match(guidance, /answers manually/i);
  assert.match(guidance, /OpenStreetMap tagging/i);
});

test('Landmass Matching guidance describes polygon limits and the enclosed-island rule', () => {
  const category = createCategory({
    categoryId: 'matching',
    name: 'Matching',
    resolverKind: 'nearest_feature_match',
    promptTemplate: 'Is the nearest _____ the same for both of us?'
  });
  const template = createTemplate({
    templateId: 'matching-landmass',
    categoryId: 'matching',
    name: 'A Landmass',
    featureClassRefs: [{ featureClassId: 'landmass', label: 'Landmass', rawLabel: 'Landmass' }]
  });

  const guidance = describeExpectedAnswerGuidance(template, category);
  assert.match(guidance, /complete mapped island polygons/i);
  assert.match(guidance, /fully surrounded/i);
  assert.match(guidance, /answers manually/i);
});

test('question guidance describes mapped international-border Measuring and enclave coverage', () => {
  const category = createCategory({
    categoryId: 'measuring',
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    promptTemplate: 'Compared to me, are you closer to or further from _____?',
    defaultConstraintRefs: ['comparative-distance']
  });
  const template = createTemplate({
    templateId: 'measuring-an-international-border',
    categoryId: 'measuring',
    name: 'An International Border',
    featureClassRefs: [{
      featureClassId: 'an-international-border', label: 'An International Border', rawLabel: 'An International Border'
    }],
    constraintRefs: ['comparative-distance']
  });

  assert.match(describeExpectedAnswerGuidance(template, category), /mapped international borders/i);
  assert.match(describeExpectedAnswerGuidance(template, category), /enclaves/i);
});

test('question guidance describes named water-shape Measuring and excludes swimming pools', () => {
  const category = createCategory({
    categoryId: 'measuring',
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    promptTemplate: 'Compared to me, are you closer to or further from _____?',
    defaultConstraintRefs: ['comparative-distance']
  });
  const template = createTemplate({
    templateId: 'measuring-a-body-of-water',
    categoryId: 'measuring',
    name: 'A Body of Water',
    featureClassRefs: [{ featureClassId: 'a-body-of-water', label: 'A Body of Water', rawLabel: 'A Body of Water' }],
    constraintRefs: ['comparative-distance']
  });

  assert.match(describeExpectedAnswerGuidance(template, category), /named water area or river line/i);
  assert.match(describeExpectedAnswerGuidance(template, category), /swimming pools/i);
});

test('question guidance limits automatic coastline Measuring to mapped ocean shoreline', () => {
  const category = createCategory({
    categoryId: 'measuring',
    name: 'Measuring',
    resolverKind: 'comparative_distance',
    promptTemplate: 'Compared to me, are you closer to or further from _____?',
    defaultConstraintRefs: ['comparative-distance']
  });
  const template = createTemplate({
    templateId: 'measuring-a-coastline',
    categoryId: 'measuring',
    name: 'A Coastline',
    featureClassRefs: [{ featureClassId: 'a-coastline', label: 'A Coastline', rawLabel: 'A Coastline' }],
    constraintRefs: ['comparative-distance']
  });

  const guidance = describeExpectedAnswerGuidance(template, category);
  assert.match(guidance, /mapped ocean[- ]coastline/i);
  assert.match(guidance, /great-lake shorelines or waterways at least 2 km wide/i);
  assert.match(guidance, /manual/i);
});

test('Tentacles guidance explains the seeker-anchored reach and automatic closest-place answer', () => {
  const category = createCategory({
    categoryId: 'tentacles',
    name: 'Tentacles',
    resolverKind: 'nearest_candidate',
    promptTemplate: 'Within [Distance] of me, which [Places] are you nearest to?'
  });
  const template = createTemplate({
    templateId: 'tentacles-museums',
    categoryId: 'tentacles',
    name: 'Museums within 1.6 km',
    featureClassRefs: [{ featureClassId: 'museums', label: 'Museums', rawLabel: 'Museums' }],
    parameters: { distanceThreshold: { meters: 1600, metricText: '1.6 km' } },
    answerSchema: { kind: 'feature_choice' }
  });

  assert.match(describeExpectedAnswerGuidance(template, category), /checks the seeker reach radius/i);
  assert.match(describeExpectedAnswerGuidance(template, category), /closest to the hider/i);
  const metroTemplate = { ...template,
    featureClassRefs: [{ featureClassId: 'metro-lines', label: 'Metro Lines', rawLabel: 'Metro Lines' }]
  };
  assert.match(describeExpectedAnswerGuidance(metroTemplate, category), /mapped subway routes/i);
  assert.match(describeExpectedAnswerGuidance(metroTemplate, category), /incomplete route geometry stays manual/i);
});
