import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildQuestionSelectionState } from '../../../packages/domain/src/index.ts';
import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { ensureMobileShellContentPack } from '../src/runtime/augment-content-pack.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import {
  findActiveQuestion,
  findQuestionCategory,
  findQuestionTemplate
} from '../src/features/questions/question-catalog.ts';
import {
  buildDemoMovementCommands,
  buildQuestionFlowBootstrapCommands
} from '../src/features/questions/question-flow-bootstrap.ts';
import {
  buildConstraintResolutionMetadata,
  chooseConstraintIdForQuestion,
  describeTemplateSupport
} from '../src/features/questions/question-flow-state.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return ensureMobileShellContentPack(JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack);
}

test('question flow bootstrap reaches seek phase ready with a bounded playable region', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-q-1',
    authUserId: 'auth-host-q-1'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-question-bootstrap',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const commands = buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection);
  assert.equal(commands.some((command) => command.type === 'create_map_region'), true);
  assert.equal(commands.some((command) => command.type === 'start_match'), true);
  assert.equal(commands.some((command) => command.type === 'end_hide_phase'), true);

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    commands
  );

  assert.equal(prepared.projectionDelivery.projection.lifecycleState, 'seek_phase');
  assert.equal(prepared.projectionDelivery.projection.seekPhaseSubstate, 'ready');
  assert.equal(Boolean(prepared.projectionDelivery.projection.visibleMap?.remainingArea?.clippedToRegion), true);

  await orchestrator.disconnect(created.connection);
});

test('question flow ask, answer, and resolve path updates the authoritative bounded map', async () => {
  const contentPack = loadContentPack();
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack,
    environment: mobileAppEnvironment
  });
  const hostProfile = {
    displayName: 'Host',
    playerId: 'host-q-2',
    authUserId: 'auth-host-q-2'
  };

  const created = await orchestrator.createMatch(hostProfile, {
    runtimeKind: 'in_memory',
    matchId: 'mobile-question-radar',
    initialScale: 'small',
    matchMode: 'single_device_referee'
  });

  const prepared = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection)
  );

  const moved = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    buildDemoMovementCommands(prepared.projectionDelivery.projection.visibleMap?.playableBoundary.geometry)
  );

  const radarCategory = contentPack.questionCategories.find((entry) => entry.categoryId === 'radar');
  assert.ok(radarCategory);
  const radarSelection = buildQuestionSelectionState({
    contentPack,
    category: radarCategory!,
    selectedScale: 'small',
    askedQuestions: []
  });

  const asked = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'begin_question_prompt',
        payload: {}
      },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: 'question:mobile-radar',
          templateId: radarSelection.availableTemplateIds[0]!,
          targetTeamId: 'team-hider'
        }
      }
    ]
  );

  assert.equal(asked.projectionDelivery.projection.seekPhaseSubstate, 'awaiting_question_answer');

  const answered = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'answer_question',
        payload: {
          questionInstanceId: 'question:mobile-radar',
          answer: {
            value: 'yes'
          }
        }
      }
    ]
  );

  const activeQuestion = findActiveQuestion(answered.projectionDelivery.projection);
  const template = findQuestionTemplate(contentPack, activeQuestion?.templateId);
  const category = findQuestionCategory(contentPack, activeQuestion?.categoryId);
  assert.ok(activeQuestion);
  assert.ok(template);
  assert.ok(category);

  const constraintId = chooseConstraintIdForQuestion({
    category: category!,
    template: template!,
    question: activeQuestion!
  });

  const resolved = await orchestrator.submitCommands(
    created.connection,
    {
      actorId: hostProfile.playerId,
      playerId: hostProfile.playerId,
      role: 'host'
    },
    [
      {
        type: 'apply_constraint',
        payload: {
          questionInstanceId: activeQuestion!.questionInstanceId,
          constraintId: constraintId!,
          metadata: buildConstraintResolutionMetadata({
            contentPack,
            visibleMap: answered.projectionDelivery.projection.visibleMap,
            template: template!,
            question: activeQuestion!
          })
        }
      }
    ]
  );

  assert.ok(
    resolved.projectionDelivery.projection.seekPhaseSubstate === 'cooldown' ||
      resolved.projectionDelivery.projection.seekPhaseSubstate === 'ready'
  );
  assert.equal(resolved.projectionDelivery.projection.visibleMap?.history.length, 1);
  assert.equal(resolved.projectionDelivery.projection.visibleConstraints.length, 1);
  assert.equal(resolved.projectionDelivery.projection.visibleConstraints[0]?.resolutionMode, 'approximate');
  assert.equal(
    resolved.projectionDelivery.projection.visibleMap?.remainingArea?.clippedToRegion,
    true
  );

  const beforeGeometry = moved.projectionDelivery.projection.visibleMap?.remainingArea?.geometry;
  const afterGeometry = resolved.projectionDelivery.projection.visibleMap?.remainingArea?.geometry;
  assert.notDeepEqual(afterGeometry, beforeGeometry);

  await orchestrator.disconnect(created.connection);
});

test('question support helper stays honest about approximate and metadata-only paths', () => {
  const contentPack = loadContentPack();
  const photosTemplate = findQuestionTemplate(contentPack, 'photos-a-tree');
  const photosCategory = findQuestionCategory(contentPack, photosTemplate?.categoryId);
  const matchingTemplate = findQuestionTemplate(contentPack, 'matching-commercial-airport');
  const matchingCategory = findQuestionCategory(contentPack, matchingTemplate?.categoryId);

  assert.equal(
    describeTemplateSupport({
      template: photosTemplate!,
      category: photosCategory!,
      regionId: 'seed-prague-city'
    }),
    'Records evidence without changing the map directly'
  );
  assert.equal(
    describeTemplateSupport({
      template: matchingTemplate!,
      category: matchingCategory!,
      regionId: 'seed-prague-city'
    }),
    'Can update the map from the available place data in this region'
  );
  assert.equal(
    describeTemplateSupport({
      template: matchingTemplate!,
      category: matchingCategory!,
      regionId: 'unknown-region'
    }),
    'Will stay as recorded evidence until richer place data is available'
  );
});
