import assert from 'node:assert/strict';
import test from 'node:test';

import type { CardDefinition, MatchProjection } from '../../../packages/shared-types/src/index.ts';

import {
  buildCardWorkbookPlayability,
  buildKnownPowerUpDescription,
  buildQuestionResponseCardReason,
  buildScaleAwareTimeBonusDescription,
  buildCurseEffectTags
} from '../src/features/cards/card-workbook-rules.ts';

function createCard(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardDefinitionId: 'card-1',
    packId: 'pack-1',
    deckId: 'deck-1',
    kind: 'power_up',
    name: 'Randomize',
    description: 'Effect text is not defined in the workbook.',
    automationLevel: 'manual',
    effects: [],
    visibilityPolicy: {
      visibleTo: ['team_private']
    },
    sourceProvenance: [],
    ...overrides
  };
}

function createProjection(lifecycleState: MatchProjection['lifecycleState'], seekPhaseSubstate?: MatchProjection['seekPhaseSubstate']): MatchProjection {
  return {
    matchId: 'match-1',
    contentPackId: 'pack-1',
    lifecycleState,
    seekPhaseSubstate,
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
}

test('card workbook helpers expose scale-aware time bonuses and named power-up fallbacks', () => {
  const timeBonus = createCard({
    kind: 'time_bonus',
    name: 'Time Bonus Red',
    automationLevel: 'authoritative',
    effects: [
      {
        effectType: 'add_time_bonus',
        description: 'Adds bonus time.',
        automationLevel: 'authoritative',
        payload: {
          minutesByScale: {
            small: 2,
            medium: 3,
            large: 5
          }
        }
      }
    ]
  });

  assert.match(buildKnownPowerUpDescription(createCard()) ?? '', /Redraw the current clue set/i);
  assert.equal(
    buildScaleAwareTimeBonusDescription(timeBonus, 'medium'),
    'This medium match would gain 3 minutes if this bonus resolves.'
  );
});

test('card workbook helpers stay honest about manual checks and blocked curse cases', () => {
  const curse = createCard({
    kind: 'curse',
    name: 'Curse Of The Egg Partner',
    description: 'This curse cannot be played during the endgame.',
    castingCost: [
      {
        requirementType: 'raw_text',
        description: 'Discard 2 cards'
      }
    ]
  });
  const discardDraw = createCard({
    name: 'Discard 2 Draw 3'
  });

  const blockedCurse = buildCardWorkbookPlayability({
    card: curse,
    projection: createProjection('endgame'),
    selectedScale: 'large',
    handCardCount: 1,
    handCardKindCounts: {
      curse: 1
    }
  });
  const blockedPowerUp = buildCardWorkbookPlayability({
    card: discardDraw,
    projection: createProjection('seek_phase', 'ready'),
    selectedScale: 'small',
    handCardCount: 2,
    handCardKindCounts: {
      power_up: 2
    }
  });

  assert.equal(blockedCurse.label, 'Not playable yet');
  assert.match(blockedCurse.detail, /cannot be played during the endgame/i);
  assert.equal(blockedPowerUp.label, 'Not playable yet');
  assert.match(blockedPowerUp.detail, /discard 2 other cards/i);
});

test('card workbook helpers classify curses and response-use guidance', () => {
  const curse = createCard({
    kind: 'curse',
    name: 'Curse Of The Endless Tumble',
    description: 'Seekers must roll a die and cannot ask another question until they succeed.'
  });
  const move = createCard({
    name: 'Move'
  });

  assert.deepEqual(buildCurseEffectTags(curse), ['Affects question access', 'Needs a dice check']);
  assert.match(
    buildQuestionResponseCardReason(move, 'thermometer', 'medium') ?? '',
    /movement-based clues/i
  );
});
