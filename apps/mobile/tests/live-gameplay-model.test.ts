import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  MatchProjection,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../packages/shared-types/src/index.ts';

import { buildLiveGameplayGuideModel, buildLiveDeckSummaryModel } from '../src/features/map/live-gameplay-model.ts';

const baseProjection: MatchProjection = {
  matchId: 'match-1',
  contentPackId: 'pack-1',
  lifecycleState: 'seek_phase',
  seekPhaseSubstate: 'ready',
  players: [],
  teams: [],
  visibleMovementTracks: [],
  visibleChatChannels: [],
  visibleChatMessages: [],
  visibleAttachments: [],
  visibleCards: [],
  visibleQuestions: [],
  visibleConstraints: [],
  visibleTimers: [],
  visibleEventLog: []
};

const activeCategory: QuestionCategoryDefinition = {
  categoryId: 'radar',
  packId: 'pack-1',
  name: 'Radar',
  resolverKind: 'threshold_distance',
  promptTemplate: 'Is the hider within [Distance]?',
  drawRule: {
    drawCount: 2,
    pickCount: 1,
    rawText: 'Draw 2, Pick 1'
  },
  defaultTimerPolicy: {
    kind: 'fixed',
    durationSeconds: 300
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
  sourceProvenance: []
};

const activeTemplate: QuestionTemplateDefinition = {
  templateId: 'template-radar',
  packId: 'pack-1',
  categoryId: 'radar',
  name: 'Radar clue',
  promptOverrides: {
    prompt: 'Is the hider within [Distance] of the seeker?'
  },
  featureClassRefs: [],
  parameters: {
    distanceThreshold: {
      metricText: '500 m'
    }
  },
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
  sourceProvenance: []
};

test('live gameplay guide makes the next seeker action map-first and obvious', () => {
  const model = buildLiveGameplayGuideModel({
    role: 'seeker',
    projection: baseProjection,
    currentSearchAreaLabel: 'Exact bounded search area',
    latestQuestionEffect: undefined,
    hasDeckAccess: false
  });

  assert.equal(model.badge, 'Your move');
  assert.equal(model.actions[0]?.href, '/questions');
  assert.equal(model.actions[0]?.label, 'Ask A Clue');
  assert.equal(model.facts[1]?.value, 'Ready for the next clue');
});

test('live gameplay guide sends the hider to answer the active clue before anything else', () => {
  const model = buildLiveGameplayGuideModel({
    role: 'hider',
    projection: {
      ...baseProjection,
      seekPhaseSubstate: 'awaiting_question_answer'
    },
    currentSearchAreaLabel: 'Approximate bounded search area',
    activeQuestionTemplate: activeTemplate,
    activeQuestionCategory: activeCategory,
    activeQuestionTimerLabel: '04:21',
    latestQuestionEffect: undefined,
    hasDeckAccess: true
  });

  assert.equal(model.badge, 'Answer now');
  assert.equal(model.actions[0]?.href, '/questions');
  assert.equal(model.actions[1]?.href, '/cards');
  assert.match(model.detail, /within 500 m/i);
});

test('live deck summary keeps the hider hand tied to the current chase state', () => {
  const summary = buildLiveDeckSummaryModel({
    role: 'hider',
    projection: baseProjection,
    activeQuestionCategory: activeCategory,
    hiderDeck: {
      deck: {
        deckId: 'hider-main',
        packId: 'pack-1',
        name: 'Hider Deck',
        ownerScope: 'hider_team',
        drawPolicy: {
          shuffleOnCreate: true,
          reshuffleDiscardIntoDraw: true
        },
        visibilityPolicy: {
          visibleTo: ['team_private']
        },
        entries: [],
        sourceProvenance: []
      },
      visibleCards: [],
      visibleByZone: {
        hand: [1, 2, 3, 4].map((index) => ({
          card: {
            cardInstanceId: `card-${index}`,
            cardDefinitionId: `definition-${index}`,
            zone: 'hand',
            holderType: 'team',
            holderId: 'team-hider'
          },
          definition: {
            cardDefinitionId: `definition-${index}`,
            deckId: 'hider-main',
            packId: 'pack-1',
            name: `Card ${index}`,
            kind: 'power_up',
            automationLevel: 'manual',
            description: 'Manual card',
            effects: [],
            visibilityPolicy: {
              visibleTo: ['team_private']
            },
            sourceProvenance: []
          },
          deck: {
            deckId: 'hider-main',
            packId: 'pack-1',
            name: 'Hider Deck',
            ownerScope: 'hider_team',
            drawPolicy: {
              shuffleOnCreate: true,
              reshuffleDiscardIntoDraw: true
            },
            visibilityPolicy: {
              visibleTo: ['team_private']
            },
            entries: [],
            sourceProvenance: []
          }
        })),
        draw_pile: [],
        discard_pile: [],
        exile: [],
        pending_resolution: []
      }
    }
  });

  assert.ok(summary);
  assert.equal(summary?.title, 'Refill the hand before the next clue');
  assert.equal(summary?.facts[0]?.value, '4 / 6');
  assert.equal(summary?.action.href, '/cards');
});
