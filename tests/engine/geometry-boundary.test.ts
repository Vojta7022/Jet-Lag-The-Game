import assert from 'node:assert/strict';
import test from 'node:test';

import { executeCommand } from '../../packages/engine/src/index.ts';
import {
  getCurrentQuestionTemplate,
  loadEngineTestContentPack,
  makeEnvelope,
  makeSquarePolygon,
  setupMatchToHidePhase,
  setupMatchToSeekReady
} from './helpers.ts';

function setupMatchToApplyingConstraints() {
  const contentPack = loadEngineTestContentPack();
  let aggregate = setupMatchToSeekReady(contentPack);
  const matchingTemplate = getCurrentQuestionTemplate(
    aggregate,
    contentPack,
    'matching',
    'matching-commercial-airport'
  );

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      70
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question-geometry',
          templateId: matchingTemplate.templateId,
          targetTeamId: 'team-hider'
        }
      },
      71
    ),
    contentPack
  ).aggregate;

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'answer_question',
        payload: {
          questionInstanceId: 'question-geometry',
          answer: {
            value: 'yes'
          }
        }
      },
      72
    ),
    contentPack
  ).aggregate;

  return { aggregate, contentPack };
}

test('selected playable region initializes the bounded candidate area from the region boundary', () => {
  const contentPack = loadEngineTestContentPack();
  const aggregate = setupMatchToHidePhase(contentPack);

  assert.equal(aggregate.mapRegion?.displayName, 'Prague');
  assert.equal(aggregate.mapRegion?.regionKind, 'city');
  assert.deepEqual(aggregate.searchArea?.remainingArea.geometry, aggregate.mapRegion?.boundaryGeometry);
  assert.equal(aggregate.searchArea?.remainingArea.kind, 'candidate_remaining');
  assert.equal(aggregate.searchArea?.remainingArea.clippedToRegion, true);
  assert.equal(aggregate.searchArea?.regionId, aggregate.mapRegion?.regionId);
});

test('preclipped constraint artifacts narrow the search area while staying inside the selected region', () => {
  const { aggregate: applyingConstraintsAggregate, contentPack } = setupMatchToApplyingConstraints();
  let aggregate = applyingConstraintsAggregate;

  const narrowedArea = makeSquarePolygon(0.05);
  const eliminatedArea = makeSquarePolygon(0.15);

  aggregate = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'apply_constraint',
        payload: {
          questionInstanceId: 'question-geometry',
          constraintId: 'nearest-feature-match',
          metadata: {
            answer: 'yes',
            spatial: {
              mode: 'preclipped',
              regionId: 'region-1',
              precision: 'exact',
              featureCoverage: 'approximate',
              explanation: 'Airport proximity clipped to the playable Prague boundary.',
              remainingAreaGeometry: narrowedArea,
              eliminatedAreaGeometries: [eliminatedArea]
            }
          }
        }
      },
      73
    ),
    contentPack
  ).aggregate;

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'exact');
  assert.ok(constraint.artifacts.every((artifact) => artifact.regionId === 'region-1'));
  assert.ok(constraint.artifacts.every((artifact) => artifact.clippedToRegion));
  assert.deepEqual(aggregate.searchArea?.remainingArea.geometry, narrowedArea);
  assert.equal(aggregate.searchArea?.eliminatedAreas.length, 1);
  assert.deepEqual(aggregate.searchArea?.eliminatedAreas[0]?.geometry, eliminatedArea);
});

test('non-preclipped spatial metadata degrades to metadata-only and keeps the bounded region intact', () => {
  const { aggregate: applyingConstraintsAggregate, contentPack } = setupMatchToApplyingConstraints();
  const initialRemainingArea = applyingConstraintsAggregate.searchArea?.remainingArea.geometry;

  const aggregate = executeCommand(
    applyingConstraintsAggregate,
    makeEnvelope(
      applyingConstraintsAggregate.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'apply_constraint',
        payload: {
          questionInstanceId: 'question-geometry',
          constraintId: 'nearest-feature-match',
          metadata: {
            answer: 'yes',
            spatial: {
              mode: 'metadata_only',
              regionId: 'other-region',
              remainingAreaGeometry: makeSquarePolygon(0.2)
            }
          }
        }
      },
      74
    ),
    contentPack
  ).aggregate;

  const constraint = Object.values(aggregate.constraints)[0];
  assert.equal(constraint.resolutionMode, 'metadata_only');
  assert.equal(constraint.artifacts.length, 1);
  assert.equal(constraint.artifacts[0]?.kind, 'constraint_overlay');
  assert.equal(constraint.artifacts[0]?.precision, 'metadata_only');
  assert.equal(constraint.artifacts[0]?.geometry, undefined);
  assert.deepEqual(aggregate.searchArea?.remainingArea.geometry, initialRemainingArea);
});
