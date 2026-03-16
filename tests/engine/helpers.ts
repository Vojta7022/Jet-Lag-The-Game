import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type {
  CommandEnvelope,
  ContentPack,
  DomainCommand,
  MatchAggregate,
  MatchRole,
  QuestionTemplateDefinition,
  RulesetDefinition
} from '../../packages/shared-types/src/index.ts';
import { buildQuestionSelectionState } from '../../packages/domain/src/index.ts';
import { executeCommand } from '../../packages/engine/src/index.ts';

const generatedPackPath = fileURLToPath(
  new URL('../../samples/generated/jet-lag-the-game.content-pack.json', import.meta.url)
);

export function makeSquarePolygon(offset = 0) {
  return {
    type: 'Polygon',
    coordinates: [
      [
        [14 + offset, 50 + offset],
        [14.4 + offset, 50 + offset],
        [14.4 + offset, 50.4 + offset],
        [14 + offset, 50.4 + offset],
        [14 + offset, 50 + offset]
      ]
    ]
  };
}

export function loadEngineTestContentPack(): ContentPack {
  const raw = readFileSync(generatedPackPath, 'utf8');
  const contentPack = JSON.parse(raw) as ContentPack;

  const ruleset: RulesetDefinition = {
    rulesetId: 'test-ruleset',
    packId: contentPack.packId,
    name: 'Test Ruleset',
    description: 'Minimal ruleset injected for engine foundation tests.',
    supportedModes: ['online', 'local_nearby', 'single_device_referee'],
    scaleDefinitions: [
      { scale: 'small', label: 'Small' },
      { scale: 'medium', label: 'Medium' },
      { scale: 'large', label: 'Large' }
    ],
    phasePolicies: {
      hidePhaseDurationSeconds: 120
    },
    questionPolicies: {
      cooldownSeconds: 45
    },
    cardPolicies: {
      stackManualResolutionWindows: false
    },
    locationPolicies: {},
    chatPolicies: {},
    visibilityPolicies: {},
    winConditions: [],
    sourceProvenance: [
      {
        sourceType: 'generated',
        sourceFileName: 'tests/engine/helpers.ts',
        notes: 'Injected minimal ruleset for engine tests.'
      }
    ]
  };

  return {
    ...contentPack,
    rulesets: [ruleset]
  };
}

export function makeEnvelope(
  matchId: string,
  actor: { actorId: string; playerId?: string; role: MatchRole },
  command: DomainCommand,
  step: number
): CommandEnvelope {
  return {
    commandId: `command-${step}`,
    matchId,
    actor,
    occurredAt: new Date(Date.UTC(2026, 0, 1, 0, 0, step)).toISOString(),
    idempotencyKey: `idempotency-${step}`,
    clientSequence: step,
    command
  };
}

export function dispatchSequence(
  contentPack: ContentPack,
  commands: CommandEnvelope[]
): MatchAggregate {
  let aggregate: MatchAggregate | undefined;

  for (const envelope of commands) {
    aggregate = executeCommand(aggregate, envelope, contentPack).aggregate;
  }

  if (!aggregate) {
    throw new Error('Sequence did not produce an aggregate.');
  }

  return aggregate;
}

export function setupMatchToHidePhase(
  contentPack: ContentPack,
  initialScale: 'small' | 'medium' | 'large' = 'small'
): MatchAggregate {
  const matchId = 'match-1';

  return dispatchSequence(contentPack, [
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_match',
        payload: {
          mode: 'single_device_referee',
          contentPackId: contentPack.packId,
          hostPlayerId: 'host-1',
          hostDisplayName: 'Host',
          initialScale
        }
      },
      1
    ),
    makeEnvelope(
      matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'join_match',
        payload: {
          playerId: 'hider-1',
          displayName: 'Hider'
        }
      },
      2
    ),
    makeEnvelope(
      matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'join_match',
        payload: {
          playerId: 'seeker-1',
          displayName: 'Seeker'
        }
      },
      3
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'hider-1',
          role: 'hider',
          teamId: 'team-hider'
        }
      },
      4
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'assign_role',
        payload: {
          targetPlayerId: 'seeker-1',
          role: 'seeker',
          teamId: 'team-seeker'
        }
      },
      5
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'confirm_roles',
        payload: {}
      },
      6
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'set_ruleset',
        payload: {
          rulesetId: 'test-ruleset'
        }
      },
      7
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'confirm_rules',
        payload: {}
      },
      8
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'create_map_region',
        payload: {
          regionId: 'region-1',
          displayName: 'Prague',
          regionKind: 'city',
          featureDatasetRefs: ['osm-core', 'transit-registry'],
          geometry: makeSquarePolygon()
        }
      },
      9
    ),
    makeEnvelope(
      matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'start_match',
        payload: {}
      },
      10
    )
  ]);
}

export function setupMatchToSeekReady(
  contentPack: ContentPack,
  initialScale: 'small' | 'medium' | 'large' = 'small'
): MatchAggregate {
  const match = setupMatchToHidePhase(contentPack, initialScale);

  const afterLock = executeCommand(
    match,
    makeEnvelope(
      match.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'lock_hider_location',
        payload: {
          latitude: 1.1,
          longitude: 103.8,
          accuracyMeters: 10
        }
      },
      11
    ),
    contentPack
  ).aggregate;

  return executeCommand(
    afterLock,
    makeEnvelope(
      afterLock.matchId,
      { actorId: 'host-1', playerId: 'host-1', role: 'host' },
      {
        type: 'end_hide_phase',
        payload: {}
      },
      12
    ),
    contentPack
  ).aggregate;
}

export function moveCardToTeamHand(
  aggregate: MatchAggregate,
  cardDefinitionPrefix: string,
  teamId: string
): string {
  const card = Object.values(aggregate.cardInstances).find(
    (candidate) =>
      candidate.zone === 'draw_pile' &&
      candidate.cardDefinitionId.startsWith(cardDefinitionPrefix)
  );

  if (!card) {
    throw new Error(`No card instance found for prefix ${cardDefinitionPrefix}`);
  }

  aggregate.cardInstances[card.cardInstanceId] = {
    ...card,
    zone: 'hand',
    holderType: 'team',
    holderId: teamId,
    updatedAt: new Date(Date.UTC(2026, 0, 1, 0, 5, 0)).toISOString()
  };

  return card.cardInstanceId;
}

export function recordLocationUpdate(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  args: {
    playerId: string;
    role: MatchRole;
    latitude: number;
    longitude: number;
    accuracyMeters?: number;
    source?: 'device' | 'manual' | 'system';
    step: number;
  }
): MatchAggregate {
  return executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: args.playerId, playerId: args.playerId, role: args.role },
      {
        type: 'update_location',
        payload: {
          latitude: args.latitude,
          longitude: args.longitude,
          accuracyMeters: args.accuracyMeters,
          source: args.source
        }
      },
      args.step
    ),
    contentPack
  ).aggregate;
}

export function getCurrentQuestionTemplate(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  categoryId: string,
  preferredTemplateId?: string
): QuestionTemplateDefinition {
  const category = contentPack.questionCategories.find((entry) => entry.categoryId === categoryId);

  if (!category) {
    throw new Error(`Question category not found: ${categoryId}`);
  }

  const selection = buildQuestionSelectionState({
    contentPack,
    category,
    selectedScale: aggregate.selectedScale,
    askedQuestions: Object.values(aggregate.questionInstances)
  });
  const availableTemplates = contentPack.questionTemplates.filter(
    (template) => selection.availableTemplateIds.includes(template.templateId)
  );

  if (preferredTemplateId) {
    const preferredTemplate = availableTemplates.find((template) => template.templateId === preferredTemplateId);

    if (preferredTemplate) {
      return preferredTemplate;
    }
  }

  const firstAvailableTemplate = availableTemplates[0];

  if (!firstAvailableTemplate) {
    throw new Error(`No authoritative question template is available for category ${categoryId}`);
  }

  return firstAvailableTemplate;
}

export function getPrimaryFeatureClassId(template: QuestionTemplateDefinition): string {
  const featureClassId = template.featureClassRefs?.[0]?.featureClassId;

  if (!featureClassId) {
    throw new Error(`Question template ${template.templateId} does not define a primary feature class.`);
  }

  return featureClassId;
}

export function openAnsweredQuestion(
  aggregate: MatchAggregate,
  contentPack: ContentPack,
  args: {
    questionInstanceId: string;
    templateId: string;
    answer: Record<string, unknown>;
    startStep: number;
  }
): MatchAggregate {
  let next = executeCommand(
    aggregate,
    makeEnvelope(
      aggregate.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      { type: 'begin_question_prompt', payload: {} },
      args.startStep
    ),
    contentPack
  ).aggregate;

  next = executeCommand(
    next,
    makeEnvelope(
      next.matchId,
      { actorId: 'seeker-1', playerId: 'seeker-1', role: 'seeker' },
      {
        type: 'ask_question',
        payload: {
          questionInstanceId: args.questionInstanceId,
          templateId: args.templateId,
          targetTeamId: 'team-hider'
        }
      },
      args.startStep + 1
    ),
    contentPack
  ).aggregate;

  const attachmentIds = Array.isArray(args.answer.attachmentIds)
    ? args.answer.attachmentIds.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    : [];

  for (const [index, attachmentId] of attachmentIds.entries()) {
    next = executeCommand(
      next,
      makeEnvelope(
        next.matchId,
        { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
        {
          type: 'upload_attachment',
          payload: {
            attachmentId,
            kind: 'photo_evidence',
            label: `Evidence ${index + 1}`,
            note: 'Engine test attachment placeholder',
            visibilityScope: 'team_private',
            questionInstanceId: args.questionInstanceId,
            captureMetadata: {
              source: 'engine-tests'
            }
          }
        },
        args.startStep + 2 + index
      ),
      contentPack
    ).aggregate;
  }

  return executeCommand(
    next,
    makeEnvelope(
      next.matchId,
      { actorId: 'hider-1', playerId: 'hider-1', role: 'hider' },
      {
        type: 'answer_question',
        payload: {
          questionInstanceId: args.questionInstanceId,
          answer: args.answer
        }
      },
      args.startStep + 2 + attachmentIds.length
    ),
    contentPack
  ).aggregate;
}
