import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../packages/shared-types/src/index.ts';

import {
  filterTemplatesForScale,
  formatHiderCardReward,
  formatTimerPolicyLabel
} from '../src/features/questions/question-rule-model.ts';

function createCategory(overrides: Partial<QuestionCategoryDefinition> = {}): QuestionCategoryDefinition {
  return {
    categoryId: 'matching',
    packId: 'pack-1',
    name: 'Matching',
    resolverKind: 'nearest_feature_match',
    promptTemplate: 'Is your nearest _____ the same as my nearest _____?',
    drawRule: {
      drawCount: 3,
      pickCount: 1,
      rawText: 'Draw 3, Pick 1'
    },
    defaultTimerPolicy: {
      kind: 'fixed',
      durationSeconds: 300
    },
    defaultAnswerSchema: {
      kind: 'enum'
    },
    visibilityPolicy: {
      visibleTo: ['public_match']
    },
    scaleSet: {
      appliesTo: ['small', 'medium', 'large']
    },
    sourceProvenance: [],
    ...overrides
  };
}

function createTemplate(id: string, scales: Array<'small' | 'medium' | 'large'> = ['small', 'medium', 'large']): QuestionTemplateDefinition {
  return {
    templateId: id,
    packId: 'pack-1',
    categoryId: 'matching',
    name: id,
    answerSchema: {
      kind: 'enum',
      allowedValues: ['yes', 'no']
    },
    resolverConfig: {},
    constraintRefs: ['nearest-feature-match'],
    scaleSet: {
      appliesTo: scales
    },
    visibilityPolicy: {
      visibleTo: ['public_match']
    },
    sourceProvenance: []
  };
}

test('hider reward text is separate from question availability', () => {
  const category = createCategory();
  const templates = [
    createTemplate('small-one'),
    createTemplate('small-two'),
    createTemplate('large-only', ['large'])
  ];

  assert.equal(formatHiderCardReward(category), 'Draw 3, Pick 1');
  assert.equal(formatHiderCardReward(category, 3), '3 separate sets of Draw 3, Pick 1');
  assert.equal(filterTemplatesForScale(templates, 'small').length, 2);
  assert.equal(filterTemplatesForScale(templates, 'large').length, 3);
  assert.equal(formatTimerPolicyLabel(category.defaultTimerPolicy, 'small'), '5 minutes');
});

test('tentacles card reward and photo answer windows follow the printed scale rules', () => {
  const tentacles = createCategory({
    categoryId: 'tentacles',
    name: 'Tentacles',
    drawRule: {
      drawCount: 4,
      pickCount: 2,
      rawText: 'Draw 4, Pick 2'
    }
  });
  const photos = createCategory({
    categoryId: 'photos',
    resolverKind: 'photo_challenge',
    drawRule: {
      drawCount: 1,
      pickCount: 1,
      rawText: 'Draw 1'
    },
    defaultTimerPolicy: {
      kind: 'by_scale',
      durationSecondsByScale: {
        small: 600,
        medium: 600,
        large: 1200
      }
    }
  });

  assert.equal(formatHiderCardReward(tentacles), 'Draw 4, Pick 2');
  assert.equal(formatHiderCardReward(tentacles, 2), '2 separate sets of Draw 4, Pick 2');
  assert.equal(formatTimerPolicyLabel(photos.defaultTimerPolicy, 'small'), '10 minutes');
  assert.equal(formatTimerPolicyLabel(photos.defaultTimerPolicy, 'large'), '20 minutes');
});
