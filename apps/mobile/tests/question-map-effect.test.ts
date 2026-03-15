import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleConstraintProjection,
  VisibleMapProjection,
  VisibleQuestionProjection
} from '../../../packages/shared-types/src/index.ts';

import { buildQuestionMapEffectModel } from '../src/features/questions/question-result-model.ts';

const baseQuestion: VisibleQuestionProjection = {
  questionInstanceId: 'question-1',
  templateId: 'template-1',
  categoryId: 'category-1',
  status: 'resolved',
  askedByPlayerId: 'player-1',
  answer: {
    value: 'Yes'
  },
  askedAt: '2026-03-15T12:00:00.000Z',
  resolvedAt: '2026-03-15T12:01:00.000Z'
};

const baseMap: VisibleMapProjection = {
  regionId: 'region-1',
  displayName: 'Prague',
  regionKind: 'city',
  featureDatasetRefs: [],
  playableBoundary: {
    artifactId: 'boundary-1',
    kind: 'playable_boundary',
    regionId: 'region-1',
    precision: 'exact',
    confidenceScore: 1,
    clippedToRegion: true,
    featureCoverage: 'exact',
    metadata: {}
  },
  remainingArea: {
    artifactId: 'remaining-2',
    kind: 'candidate_remaining',
    regionId: 'region-1',
    precision: 'approximate',
    confidenceScore: 0.7,
    clippedToRegion: true,
    featureCoverage: 'approximate',
    metadata: {}
  },
  eliminatedAreas: [],
  constraintArtifacts: [],
  history: [
    {
      historyEntryId: 'history-1',
      constraintRecordId: 'constraint-1',
      summary: 'The search area narrowed around the southern half of the city.'
    }
  ]
};

function createConstraint(
  overrides: Partial<VisibleConstraintProjection> = {}
): VisibleConstraintProjection {
  return {
    constraintRecordId: 'constraint-1',
    constraintId: 'within-radius',
    sourceQuestionInstanceId: 'question-1',
    status: 'active',
    resolutionMode: 'approximate',
    confidenceScore: 0.72,
    explanation: {
      summary: 'The answer places the hider inside the selected radius.',
      reasoningSteps: ['Apply the yes/no threshold.', 'Clip the circle to the playable region.']
    },
    beforeRemainingArtifactId: 'remaining-1',
    afterRemainingArtifactId: 'remaining-2',
    artifacts: [
      {
        artifactId: 'artifact-1',
        kind: 'candidate_remaining',
        regionId: 'region-1',
        precision: 'approximate',
        confidenceScore: 0.72,
        clippedToRegion: true,
        featureCoverage: 'approximate',
        metadata: {}
      }
    ],
    metadata: {},
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
    name: 'Question template',
    promptOverrides: {},
    featureClassRefs: [],
    parameters: {},
    answerSchema: {
      kind: 'boolean'
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

function createCategory(
  overrides: Partial<QuestionCategoryDefinition> = {}
): QuestionCategoryDefinition {
  return {
    categoryId: 'category-1',
    packId: 'pack-1',
    name: 'Question category',
    resolverKind: 'threshold_distance',
    promptTemplate: 'Choose a question.',
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

test('question map effect model explains approximate geometry updates clearly', () => {
  const model = buildQuestionMapEffectModel({
    question: baseQuestion,
    template: createTemplate({
      name: 'Is the hider within 400 meters?'
    }),
    category: createCategory({
      name: 'Radar',
      resolverKind: 'threshold_distance'
    }),
    constraint: createConstraint(),
    visibleMap: baseMap
  });

  assert.ok(model);
  assert.equal(model?.resolutionModeLabel, 'Approximate');
  assert.equal(model?.resolutionTone, 'warning');
  assert.equal(model?.mapEffectTitle, 'Search area changed');
  assert.match(model?.mapEffectDetail ?? '', /narrowed/i);
  assert.match(model?.resolutionDetail ?? '', /approximate geometry|incomplete feature coverage/i);
});

test('question map effect model stays honest for metadata-only evidence flows', () => {
  const model = buildQuestionMapEffectModel({
    question: {
      ...baseQuestion,
      answer: {
        attachmentIds: ['attachment-1'],
        note: 'Photo evidence submitted.'
      }
    },
    template: createTemplate({
      templateId: 'template-photo',
      categoryId: 'category-photo',
      name: 'Photo challenge',
      answerSchema: {
        kind: 'attachment'
      },
      constraintRefs: ['photo-evidence']
    }),
    category: createCategory({
      categoryId: 'category-photo',
      name: 'Photos',
      resolverKind: 'photo_challenge',
      defaultAnswerSchema: {
        kind: 'attachment'
      },
      defaultConstraintRefs: ['photo-evidence']
    }),
    constraint: createConstraint({
      constraintRecordId: 'constraint-photo',
      constraintId: 'photo-evidence',
      resolutionMode: 'metadata_only',
      explanation: {
        summary: 'The evidence was recorded for manual review.',
        reasoningSteps: ['Record the evidence.', 'Do not create geometry.']
      },
      artifacts: []
    }),
    visibleMap: {
      ...baseMap,
      history: []
    }
  });

  assert.ok(model);
  assert.equal(model?.resolutionModeLabel, 'Metadata-only');
  assert.equal(model?.mapEffectTitle, 'Map stayed the same');
  assert.match(model?.mapEffectDetail ?? '', /did not pretend to change/i);
  assert.equal(model?.artifactCountLabel, '0 visible artifacts');
});

test('question map effect model marks exact bounded updates as trustworthy geometry', () => {
  const model = buildQuestionMapEffectModel({
    question: baseQuestion,
    template: createTemplate({
      templateId: 'template-2',
      categoryId: 'category-2',
      name: 'Hotter or colder?',
      answerSchema: {
        kind: 'enum'
      },
      constraintRefs: ['hotter-colder']
    }),
    category: createCategory({
      categoryId: 'category-2',
      name: 'Thermometer',
      resolverKind: 'hotter_colder',
      defaultAnswerSchema: {
        kind: 'enum'
      },
      defaultConstraintRefs: ['hotter-colder']
    }),
    constraint: createConstraint({
      resolutionMode: 'exact',
      confidenceScore: 1,
      explanation: {
        summary: 'Movement history yields an exact half-plane clip.',
        reasoningSteps: ['Compare prior seeker position.', 'Clip to the hotter side exactly.']
      },
      artifacts: [
        {
          artifactId: 'artifact-2',
          kind: 'candidate_remaining',
          regionId: 'region-1',
          precision: 'exact',
          confidenceScore: 1,
          clippedToRegion: true,
          featureCoverage: 'exact',
          metadata: {}
        }
      ]
    }),
    visibleMap: {
      ...baseMap,
      remainingArea: {
        ...baseMap.remainingArea!,
        precision: 'exact'
      }
    }
  });

  assert.ok(model);
  assert.equal(model?.resolutionModeLabel, 'Exact');
  assert.equal(model?.resolutionTone, 'success');
  assert.match(model?.resolutionDetail ?? '', /directly clipped geometry/i);
  assert.equal(model?.candidatePrecisionLabel, 'exact');
});
