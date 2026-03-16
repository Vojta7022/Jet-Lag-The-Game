import assert from 'node:assert/strict';
import test from 'node:test';

import { geometryBoundingBox } from '../../packages/geo/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';
import {
  getCurrentQuestionTemplate,
  getPrimaryFeatureClassId,
  loadEngineTestContentPack,
  makeEnvelope,
  openAnsweredQuestion,
  recordLocationUpdate,
  setupMatchToSeekReady
} from './helpers.ts';

function featurePoint(
  featureId: string,
  featureClassId: string,
  longitude: number,
  latitude: number,
  label = featureId
) {
  return {
    featureId,
    featureClassId,
    label,
    representativePoint: {
      latitude,
      longitude
    },
    geometrySupport: 'point' as const,
    coverage: 'exact' as const
  };
}

function applyConstraint(
  aggregate: ReturnType<typeof setupMatchToSeekReady>,
  contentPack: ReturnType<typeof loadEngineTestContentPack>,
  args: {
    questionInstanceId: string;
    constraintId: string;
    metadata?: Record<string, unknown>;
    step: number;
  }
) {
  return executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'apply_constraint',
        payload: {
          questionInstanceId: args.questionInstanceId,
          constraintId: args.constraintId,
          metadata: args.metadata
        }
      },
      args.step
    ),
    contentPack
  ).aggregate;
}

function assertBoundsInsidePlayableRegion(aggregate: ReturnType<typeof setupMatchToSeekReady>) {
  const bounds = geometryBoundingBox(aggregate.searchArea?.remainingArea.geometry);
  assert.ok(bounds);
  assert.ok((bounds?.minLon ?? 0) >= 14 - 0.001);
  assert.ok((bounds?.maxLon ?? 0) <= 14.4 + 0.001);
  assert.ok((bounds?.minLat ?? 0) >= 50 - 0.001);
  assert.ok((bounds?.maxLat ?? 0) <= 50.4 + 0.001);
}

test('Radar resolves as an approximate bounded inclusion or exclusion constraint', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const radarTemplate = getCurrentQuestionTemplate(aggregate, contentPack, 'radar', 'radar-1600');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.2,
    longitude: 14.2,
    step: 80
  });
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-radar',
    templateId: radarTemplate.templateId,
    answer: { value: 'yes' },
    startStep: 81
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-radar',
    constraintId: 'within-radius',
    metadata: {
      gridResolutionMeters: 500
    },
    step: 84
  });

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'approximate');
  assert.match(constraint.explanation.summary, /Radar keeps the candidate area/i);
  assert.equal(aggregate.searchArea?.history.length, 1);
  assertBoundsInsidePlayableRegion(aggregate);
});

test('Thermometer uses seeker movement history and can resolve to an exact half-plane clip', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const thermometerTemplate = getCurrentQuestionTemplate(aggregate, contentPack, 'thermometer', 'thermometer-805');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.2,
    longitude: 14.05,
    step: 90
  });
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.2,
    longitude: 14.35,
    step: 91
  });
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-thermo',
    templateId: thermometerTemplate.templateId,
    answer: { value: 'hotter' },
    startStep: 92
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-thermo',
    constraintId: 'hotter-colder',
    step: 95
  });

  const constraint = Object.values(aggregate.constraints)[0];
  const bounds = geometryBoundingBox(aggregate.searchArea?.remainingArea.geometry);
  assert.equal(constraint.resolutionMode, 'exact');
  assert.match(constraint.explanation.detail ?? '', /exact half-plane clip/i);
  assert.ok((bounds?.minLon ?? 0) >= 14.18);
  assertBoundsInsidePlayableRegion(aggregate);
});

test('Matching can produce an exact result when point-feature Voronoi clipping is available', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const matchingTemplate = getCurrentQuestionTemplate(
    aggregate,
    contentPack,
    'matching',
    'matching-commercial-airport'
  );
  const featureClassId = getPrimaryFeatureClassId(matchingTemplate);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.2,
    longitude: 14.08,
    step: 100
  });
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-matching',
    templateId: matchingTemplate.templateId,
    answer: { value: 'yes' },
    startStep: 101
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-matching',
    constraintId: 'nearest-feature-match',
    metadata: {
      featureData: [
        featurePoint('feature-west', featureClassId, 14.1, 50.2, 'Feature West'),
        featurePoint('feature-east', featureClassId, 14.3, 50.2, 'Feature East')
      ]
    },
    step: 104
  });

  const constraint = Object.values(aggregate.constraints)[0];
  const bounds = geometryBoundingBox(aggregate.searchArea?.remainingArea.geometry);
  assert.equal(constraint.resolutionMode, 'exact');
  assert.match(constraint.explanation.detail ?? '', /Voronoi/i);
  assert.ok((bounds?.maxLon ?? 0) <= 14.21);
  assertBoundsInsidePlayableRegion(aggregate);
});

test('Measuring resolves approximately when it depends on distance thresholds', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const measuringTemplate = getCurrentQuestionTemplate(
    aggregate,
    contentPack,
    'measuring',
    'measuring-a-commercial-airport'
  );
  const featureClassId = getPrimaryFeatureClassId(measuringTemplate);
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 50.2,
    longitude: 14.05,
    step: 110
  });
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-measuring',
    templateId: measuringTemplate.templateId,
    answer: { value: 'closer' },
    startStep: 111
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-measuring',
    constraintId: 'comparative-distance',
    metadata: {
      gridResolutionMeters: 1_000,
      featureData: [
        featurePoint('feature-center', featureClassId, 14.2, 50.2, 'Feature Center')
      ]
    },
    step: 114
  });

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'approximate');
  assert.match(constraint.explanation.summary, /Measuring approximately keeps/i);
  assertBoundsInsidePlayableRegion(aggregate);
});

test('Tentacles resolves approximately using closest-among-candidates within the threshold', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack, 'medium');
  const tentaclesTemplate = getCurrentQuestionTemplate(
    aggregate,
    contentPack,
    'tentacles',
    'tentacles-museums-1600'
  );
  const featureClassId = getPrimaryFeatureClassId(tentaclesTemplate);
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-tentacles',
    templateId: tentaclesTemplate.templateId,
    answer: { selectedFeatureId: 'feature-east' },
    startStep: 120
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-tentacles',
    constraintId: 'nearest-candidate-feature',
    metadata: {
      gridResolutionMeters: 1_000,
      featureData: [
        featurePoint('feature-west', featureClassId, 14.18, 50.2, 'Feature West'),
        featurePoint('feature-east', featureClassId, 14.24, 50.2, 'Feature East'),
        featurePoint('feature-far', featureClassId, 14.32, 50.25, 'Feature Far')
      ]
    },
    step: 123
  });

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'approximate');
  assert.equal(constraint.metadata.selectedFeatureId, 'feature-east');
  assertBoundsInsidePlayableRegion(aggregate);
});

test('Photos stay metadata-only and do not pretend to narrow geometry', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const photosTemplate = getCurrentQuestionTemplate(aggregate, contentPack, 'photos', 'photos-a-tree');
  const originalGeometry = aggregate.searchArea?.remainingArea.geometry;
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-photo',
    templateId: photosTemplate.templateId,
    answer: { attachmentIds: ['attachment-1'] },
    startStep: 130
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-photo',
    constraintId: 'photo-evidence',
    step: 133
  });

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'metadata_only');
  assert.match(constraint.explanation.summary, /manual review/i);
  assert.deepEqual(aggregate.searchArea?.remainingArea.geometry, originalGeometry);
});

test('contradictions are detected and recorded when a constraint leaves no bounded area', () => {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const radarTemplate = getCurrentQuestionTemplate(aggregate, contentPack, 'radar', 'radar-402');
  aggregate = recordLocationUpdate(aggregate, contentPack, {
    playerId: 'seeker-1',
    role: 'seeker',
    latitude: 51,
    longitude: 15,
    step: 140
  });
  aggregate = openAnsweredQuestion(aggregate, contentPack, {
    questionInstanceId: 'question-contradiction',
    templateId: radarTemplate.templateId,
    answer: { value: 'yes' },
    startStep: 141
  });

  aggregate = applyConstraint(aggregate, contentPack, {
    questionInstanceId: 'question-contradiction',
    constraintId: 'within-radius',
    metadata: {
      gridResolutionMeters: 1_000
    },
    step: 144
  });

  const constraint = Object.values(aggregate.constraints)[0];
  assert.ok(constraint.contradiction);
  assert.ok(aggregate.searchArea?.contradiction);
  assert.equal(aggregate.searchArea?.history.length, 1);
  assert.equal(aggregate.searchArea?.history[0]?.beforeRemainingArtifactId, constraint.beforeRemainingArtifactId);
  assert.equal(aggregate.searchArea?.history[0]?.afterRemainingArtifactId, constraint.afterRemainingArtifactId);
  assert.deepEqual(aggregate.searchArea?.remainingArea.geometry, { type: 'MultiPolygon', coordinates: [] });
});
