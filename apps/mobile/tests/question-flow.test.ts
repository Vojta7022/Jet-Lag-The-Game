import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildQuestionSelectionState } from '../../../packages/domain/src/index.ts';
import type { ContentPack } from '../../../packages/shared-types/src/index.ts';

import { mobileAppEnvironment } from '../src/config/env.ts';
import { MobileRuntimeOrchestrator } from '../src/runtime/mobile-runtime-orchestrator.ts';
import { getHidePhaseDurationSeconds, getQuestionCooldownSeconds } from '../../../packages/engine/src/index.ts';
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
  buildAskQuestionPayload,
  describeTemplateSupport,
  isQuestionDistanceChoice,
  parseChosenDistanceMeters
} from '../src/features/questions/question-flow-state.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

function loadContentPack(): ContentPack {
  return JSON.parse(readFileSync(generatedPackPath, 'utf8')) as ContentPack;
}

test('Radar Choose accepts a positive seeker-entered meter value and rejects invalid distances', () => {
  const contentPack = loadContentPack();
  const radarChoose = contentPack.questionTemplates.find((template) => template.templateId === 'radar-choose');
  const fixedRadar = contentPack.questionTemplates.find((template) => template.templateId === 'radar-402');
  assert.ok(radarChoose);
  assert.ok(fixedRadar);
  assert.equal(isQuestionDistanceChoice(radarChoose!), true);
  assert.equal(isQuestionDistanceChoice(fixedRadar!), false);
  assert.equal(parseChosenDistanceMeters('1500'), 1500);
  assert.equal(parseChosenDistanceMeters('1,5'), 1.5);
  for (const invalid of ['', '0', '-1', 'NaN', 'distance']) {
    assert.equal(parseChosenDistanceMeters(invalid), undefined);
  }
  assert.deepEqual(buildAskQuestionPayload({
    questionInstanceId: 'question:choose-distance',
    template: radarChoose!,
    targetTeamId: 'team-hider',
    chosenDistanceDraft: '1500'
  }), {
    questionInstanceId: 'question:choose-distance',
    templateId: 'radar-choose',
    targetTeamId: 'team-hider',
    chosenDistanceMeters: 1500
  });
  assert.equal(buildAskQuestionPayload({
    questionInstanceId: 'question:missing-distance',
    template: radarChoose!,
    targetTeamId: 'team-hider',
    chosenDistanceDraft: ''
  }), undefined);
});

test('default referee rules match printed scale timers, radius, answer windows, and no cooldown', () => {
  const contentPack = loadContentPack();
  const ruleset = contentPack.rulesets.find((entry) => entry.rulesetId === 'jet-lag-home-game-base');
  assert.ok(ruleset);

  assert.equal(getHidePhaseDurationSeconds(contentPack, ruleset!.rulesetId, 'small'), 30 * 60);
  assert.equal(getHidePhaseDurationSeconds(contentPack, ruleset!.rulesetId, 'medium'), 60 * 60);
  assert.equal(getHidePhaseDurationSeconds(contentPack, ruleset!.rulesetId, 'large'), 180 * 60);
  assert.equal(ruleset!.locationPolicies.hidingZoneRadiusMetersByScale?.small, 500);
  assert.equal(ruleset!.locationPolicies.hidingZoneRadiusMetersByScale?.medium, 500);
  assert.equal(ruleset!.locationPolicies.hidingZoneRadiusMetersByScale?.large, 1000);
  assert.equal(getQuestionCooldownSeconds(contentPack, ruleset!.rulesetId, 'matching-commercial-airport'), 0);
  assert.equal(getQuestionCooldownSeconds(contentPack, ruleset!.rulesetId, 'photos-tree'), 0);
});

test('standard question prep starts hide phase without inventing a station or skipping the rules', async () => {
  const orchestrator = new MobileRuntimeOrchestrator({
    contentPack: loadContentPack(),
    environment: mobileAppEnvironment
  });
  const created = await orchestrator.createMatch(
    { displayName: 'Host', playerId: 'standard-prep-host' },
    {
      runtimeKind: 'in_memory',
      matchId: 'standard-prep-match',
      initialScale: 'small',
      matchMode: 'single_device_referee'
    }
  );
  const commands = buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection);

  assert.equal(commands.some((command) => command.type === 'start_match'), true);
  assert.equal(commands.some((command) => command.type === 'set_hiding_zone'), false);
  assert.equal(commands.some((command) => command.type === 'lock_hider_location'), false);
  assert.equal(commands.some((command) => command.type === 'end_hide_phase'), false);
  await orchestrator.disconnect(created.connection);
});

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

  const commands = buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection, { mode: 'demo' });
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

test('manual answer policy preserves the assisted answer and spatial constraint flow', async () => {
  const sourcePack = loadContentPack();
  const contentPack = {
    ...sourcePack,
    questionCategories: sourcePack.questionCategories.map((category) => category.categoryId === 'radar'
      ? { ...category, answerPolicy: 'manual' as const }
      : category)
  };
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
    buildQuestionFlowBootstrapCommands(created.initialSync.projectionDelivery.projection, { mode: 'demo' })
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

  assert.equal(resolved.projectionDelivery.projection.seekPhaseSubstate, 'ready');
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
  const tentaclesTemplate = findQuestionTemplate(contentPack, 'tentacles-museums-1600');
  const tentaclesCategory = findQuestionCategory(contentPack, tentaclesTemplate?.categoryId);
  const adminTemplate = findQuestionTemplate(contentPack, 'matching-1st-admin-state');

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
    'The app can answer from fresh player locations and OpenStreetMap places in the selected region when connected'
  );
  assert.equal(
    describeTemplateSupport({
      template: adminTemplate!,
      category: matchingCategory!,
      regionId: 'unknown-region'
    }),
    'The app checks fresh player locations against OpenStreetMap administrative boundaries when connected; missing or ambiguous divisions stay manual'
  );
  assert.equal(
    describeTemplateSupport({
      template: tentaclesTemplate!,
      category: tentaclesCategory!,
      regionId: 'unknown-region'
    }),
    'The app can answer from fresh player locations and OpenStreetMap places in the selected region when connected'
  );
});
