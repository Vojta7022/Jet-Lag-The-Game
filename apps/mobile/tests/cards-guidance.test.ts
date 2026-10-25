import assert from 'node:assert/strict';
import test from 'node:test';

import type {
  CardDefinition,
  DeckDefinition,
  MatchProjection,
  VisibleCardProjection
} from '../../../packages/shared-types/src/index.ts';

import { describeEffectSupport, getCardResolutionBlockedReason, type ResolvedVisibleCardModel } from '../src/features/cards/card-catalog.ts';

import {
  buildCardActionState,
  buildCardBehaviorModel,
  buildCardDescription,
  buildCardPurposeSummary,
  buildCardRestrictionSummary,
  describeCardRulebookGuidance,
  buildCardScaleNotes,
  buildResolutionWindowGuidance,
  describeDeckVisibility,
  formatDeckOwnerScope,
  summarizeVisibleDeckCounts
} from '../src/features/cards/card-guidance.ts';

function createDeck(overrides: Partial<DeckDefinition> = {}): DeckDefinition {
  return {
    deckId: 'deck-1',
    packId: 'pack-1',
    name: 'Hider Main Deck',
    ownerScope: 'hider_team',
    drawPolicy: {
      shuffleOnCreate: true,
      reshuffleDiscardIntoDraw: false
    },
    visibilityPolicy: {
      visibleTo: ['host_admin', 'team_private']
    },
    entries: [],
    sourceProvenance: [],
    ...overrides
  };
}

function createCardDefinition(overrides: Partial<CardDefinition> = {}): CardDefinition {
  return {
    cardDefinitionId: 'card-def-1',
    packId: 'pack-1',
    deckId: 'deck-1',
    kind: 'power_up',
    name: 'Randomize',
    description: 'Effect text is not defined in the workbook.',
    automationLevel: 'manual',
    effects: [
      {
        effectType: 'manual_power_up',
        description: 'Resolve manually.',
        automationLevel: 'manual'
      }
    ],
    visibilityPolicy: {
      visibleTo: ['host_admin', 'team_private']
    },
    sourceProvenance: [],
    ...overrides
  };
}

function createVisibleCard(overrides: Partial<VisibleCardProjection> = {}): VisibleCardProjection {
  return {
    cardInstanceId: 'card-instance-1',
    cardDefinitionId: 'card-def-1',
    zone: 'hand',
    holderType: 'team',
    holderId: 'team-hider',
    ...overrides
  };
}

function createResolvedVisibleCard(overrides: Partial<ResolvedVisibleCardModel> = {}): ResolvedVisibleCardModel {
  return {
    card: createVisibleCard(),
    definition: createCardDefinition(),
    deck: createDeck(),
    ...overrides
  };
}

test('card guidance stays honest about manual and authoritative behavior', () => {
  const manual = buildCardBehaviorModel(createCardDefinition({ automationLevel: 'manual' }));
  const assisted = buildCardBehaviorModel(createCardDefinition({ automationLevel: 'assisted' }));
  const authoritative = buildCardBehaviorModel(
    createCardDefinition({
      cardDefinitionId: 'time-bonus',
      kind: 'time_bonus',
      automationLevel: 'authoritative'
    })
  );

  assert.equal(manual.label, 'Manual');
  assert.match(manual.detail, /does not invent/i);
  assert.equal(assisted.label, 'Assisted');
  assert.match(assisted.detail, /resolution window/i);
  assert.equal(authoritative.label, 'Authoritative');
  assert.match(authoritative.detail, /engine applies this card directly/i);
});

test('Move guidance identifies the enforced scale-specific timer', () => {
  const move = buildCardBehaviorModel(createCardDefinition({
    cardDefinitionId: 'power-up-move',
    name: 'Move',
    effects: [{ effectType: 'move_power_up', description: 'Move to a new station.', automationLevel: 'assisted' }]
  }));

  assert.equal(move.label, 'Assisted');
  assert.match(move.detail, /relocation timer/i);
  assert.match(move.detail, /scale-specific.*timer/i);
});

test('Right Turn guidance explains route logging and player-attested limits', () => {
  const card = createCardDefinition({
    kind: 'curse',
    name: 'Curse of the Right Turn',
    automationLevel: 'assisted',
    effects: [{ effectType: 'right_turn_challenge', description: 'Only turn right.', automationLevel: 'assisted' }]
  });
  assert.match(buildCardBehaviorModel(card).detail, /route choices/i);
  assert.match(describeEffectSupport(card), /cannot verify the street layout/i);
});

test('card guidance provides honest fallback descriptions when workbook text is weak', () => {
  const weakCard = createCardDefinition({
    description: 'Effect text is not defined in the workbook.'
  });
  const explicitCard = createCardDefinition({
    description: 'Steal one turn from the opposing team.'
  });

  assert.match(buildCardPurposeSummary(weakCard), /special advantage|match effect/i);
  assert.match(buildCardDescription(weakCard), /Redraw the current clue set/i);
  assert.equal(buildCardDescription(explicitCard), 'Steal one turn from the opposing team.');
  assert.match(buildCardRestrictionSummary(weakCard), /No extra timing|Needs|Playable during|Trigger/i);
});

test('card guidance explains deck ownership and visible counts clearly', () => {
  const deck = createDeck();
  const handCard = createResolvedVisibleCard();
  const pendingCard = createResolvedVisibleCard({
    card: createVisibleCard({
      cardInstanceId: 'card-instance-2',
      zone: 'pending_resolution'
    })
  });
  const viewModel = {
    deck,
    visibleCards: [handCard, pendingCard],
    visibleByZone: {
      hand: [handCard],
      draw_pile: [],
      discard_pile: [],
      exile: [],
      pending_resolution: [pendingCard]
    }
  };

  assert.equal(formatDeckOwnerScope(deck.ownerScope), 'Hider team deck');
  assert.match(describeDeckVisibility(deck, 'hider'), /Private deck contents/i);
  assert.equal(summarizeVisibleDeckCounts(viewModel), '2 visible cards, including 1 awaiting resolution');
});

test('card action guidance explains blocked states without faking actions', () => {
  const spectatorState = buildCardActionState({
    card: createResolvedVisibleCard(),
    viewerRole: 'spectator',
    canPlay: false,
    canDiscard: false
  });
  const notInHandState = buildCardActionState({
    card: createResolvedVisibleCard({
      card: createVisibleCard({
        zone: 'discard_pile'
      })
    }),
    viewerRole: 'host',
    canPlay: false,
    canDiscard: false
  });

  assert.match(spectatorState.statusSummary, /read-only spectator view/i);
  assert.match(spectatorState.playReason ?? '', /Spectators cannot play cards/i);
  assert.match(notInHandState.statusSummary, /discard pile/i);
  assert.match(notInHandState.discardReason ?? '', /Only cards in hand/i);
});

test('card guidance extracts scale notes and resolution guidance honestly', () => {
  const authoritativeCard = createCardDefinition({
    cardDefinitionId: 'time-bonus-red',
    kind: 'time_bonus',
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
  const notes = buildCardScaleNotes(authoritativeCard);
  const inactiveGuidance = buildResolutionWindowGuidance(undefined, false);
  const activeGuidance = buildResolutionWindowGuidance(
    createResolvedVisibleCard({
      definition: createCardDefinition({ automationLevel: 'manual' })
    }),
    false
  );

  assert.equal(notes[0], 'Scale effect: Small: +2m · Medium: +3m · Large: +5m');
  assert.equal(inactiveGuidance.title, 'No active resolution window');
  assert.match(activeGuidance.title, /awaiting resolution/i);
  assert.match(activeGuidance.nextStep, /host-admin view must close/i);
});

test('card guidance returns scan-derived rulebook text for card details', () => {
  const card = createCardDefinition({
    kind: 'curse',
    rulebookGuidanceText: 'Questions already asked on transit still need an answer.'
  });

  assert.equal(describeCardRulebookGuidance(card), 'Questions already asked on transit still need an answer.');
  assert.equal(describeCardRulebookGuidance(createCardDefinition()), undefined);
});

test('Hidden Hangman stays open until solved or the hider ends the challenge', () => {
  const projection = (status: 'awaiting_word' | 'playing' | 'solved' | 'ended') => ({
    activeCardResolution: {
      sourceCardInstanceId: 'hangman-card',
      resolutionKind: 'hangman_challenge',
      hangman: { status, maskedWord: '_____', guessedLetters: [], incorrectLetters: [] }
    }
  } as unknown as MatchProjection);

  assert.equal(getCardResolutionBlockedReason('hider', projection('awaiting_word')), 'Set the secret word, then finish the seekers’ Hangman challenge.');
  assert.equal(getCardResolutionBlockedReason('hider', projection('playing')), 'Finish the seekers’ Hangman challenge before closing this card.');
  assert.equal(getCardResolutionBlockedReason('hider', projection('solved')), undefined);
  assert.equal(getCardResolutionBlockedReason('seeker', projection('solved')), 'Only the hider or host can close this card window.');
});
