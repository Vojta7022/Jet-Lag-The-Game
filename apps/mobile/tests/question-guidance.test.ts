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
  describeWorkbookRequirementSummary,
  describeWorkbookRuleSummary,
  formatQuestionScaleSet
} from '../src/features/questions/question-guidance.ts';

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
  assert.equal(impact.label, 'Approximate map update');
  assert.match(impact.detail, /narrow/i);
  assert.equal(formatQuestionScaleSet(template.scaleSet.appliesTo), 'Small, medium, and large games');
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

test('question guidance falls back to metadata-only when feature coverage is unavailable', () => {
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
  assert.equal(impact.label, 'Evidence only');
});
