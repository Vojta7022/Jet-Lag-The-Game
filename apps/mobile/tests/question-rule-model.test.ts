import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../packages/shared-types/src/index.ts';

import {
  canAskPreparedQuestion,
  consumePreparedQuestionTemplate,
  createQuestionSelectionRound,
  formatQuestionDrawRule,
  formatTimerPolicyLabel,
  toggleKeptQuestionTemplate
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

test('question round model applies workbook draw and keep rules', () => {
  const category = createCategory();
  const templates = ['a', 'b', 'c', 'd', 'e'].map((id) => createTemplate(id));
  const round = createQuestionSelectionRound({
    category,
    templates,
    selectedScale: 'small'
  });

  assert.equal(formatQuestionDrawRule(category), 'Draw 3, Pick 1');
  assert.equal(formatTimerPolicyLabel(category.defaultTimerPolicy, 'small'), '5 minutes');
  assert.equal(round.drawnTemplateIds.length, 3);
  assert.equal(round.keptTemplateIds.length, 1);
  assert.equal(canAskPreparedQuestion(round, category), true);
});

test('tentacles question rules keep two cards and photos use scale-aware timers', () => {
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
    name: 'Photos',
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
  const templates = ['a', 'b', 'c', 'd', 'e'].map((id) => createTemplate(id, ['medium', 'large']));
  const round = createQuestionSelectionRound({
    category: tentacles,
    templates,
    selectedScale: 'large'
  });
  const onceKept = toggleKeptQuestionTemplate(round, round.drawnTemplateIds[0]!, tentacles.drawRule.pickCount);
  const twiceKept = toggleKeptQuestionTemplate(onceKept, round.drawnTemplateIds[1]!, tentacles.drawRule.pickCount);
  const consumed = consumePreparedQuestionTemplate(twiceKept, round.drawnTemplateIds[0]!);

  assert.equal(round.drawnTemplateIds.length, 4);
  assert.equal(round.keptTemplateIds.length, 0);
  assert.equal(twiceKept.keptTemplateIds.length, 2);
  assert.equal(consumed?.keptTemplateIds.length, 1);
  assert.equal(formatTimerPolicyLabel(photos.defaultTimerPolicy, 'large'), '20 minutes');
});
