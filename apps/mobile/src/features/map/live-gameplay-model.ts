import type {
  MatchProjection,
  MatchRole,
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../../../packages/shared-types/src/index.ts';

import type { DeckViewModel } from '../cards/card-catalog.ts';
import { HIDER_HAND_TARGET } from '../cards/card-workbook-rules.ts';
import type { QuestionMapEffectModel } from '../questions/question-result-model.ts';
import { describeQuestionTemplateForPlayers } from '../questions/question-guidance.ts';

export type LiveGameplayActionHref = '/map' | '/questions' | '/cards' | '/chat' | '/dice' | '/lobby';

export interface LiveGameplayFact {
  label: string;
  value: string | number;
}

export interface LiveGameplayAction {
  label: string;
  href: LiveGameplayActionHref;
  tone: 'primary' | 'secondary';
}

export interface LiveGameplayGuideModel {
  badge: string;
  title: string;
  detail: string;
  tone: 'info' | 'warning' | 'success';
  facts: LiveGameplayFact[];
  actions: LiveGameplayAction[];
  footnote?: string;
}

export interface LiveDeckSummaryModel {
  title: string;
  detail: string;
  facts: LiveGameplayFact[];
  action: LiveGameplayAction;
}

interface BuildLiveGameplayGuideModelArgs {
  role: MatchRole;
  projection?: MatchProjection;
  currentSearchAreaLabel: string;
  activeQuestionTemplate?: QuestionTemplateDefinition;
  activeQuestionCategory?: QuestionCategoryDefinition;
  activeQuestionTimerLabel?: string;
  latestQuestionEffect?: QuestionMapEffectModel;
  hasDeckAccess: boolean;
}

interface BuildLiveDeckSummaryModelArgs {
  role: MatchRole;
  projection?: MatchProjection;
  hiderDeck?: DeckViewModel;
  activeQuestionCategory?: QuestionCategoryDefinition;
}

export function formatRoleLabel(role: MatchRole): string {
  switch (role) {
    case 'host':
      return 'Host';
    case 'hider':
      return 'Hider';
    case 'seeker':
      return 'Seeker';
    default:
      return 'Spectator';
  }
}

export function describeLiveClueStep(
  projection: MatchProjection | undefined,
  activeQuestionTemplateName?: string
): string {
  if (!projection) {
    return 'Waiting for a connected match';
  }

  if (projection.paused) {
    return 'Match paused';
  }

  if (projection.lifecycleState === 'hide_phase') {
    return 'Hide phase';
  }

  if (projection.lifecycleState === 'endgame') {
    return 'Endgame';
  }

  if (projection.lifecycleState === 'game_complete') {
    return 'Match complete';
  }

  if (projection.lifecycleState !== 'seek_phase') {
    return 'Waiting for live play';
  }

  switch (projection.seekPhaseSubstate) {
    case 'ready':
      return 'Ready for the next clue';
    case 'awaiting_question_selection':
      return 'Choose the next clue';
    case 'awaiting_question_answer':
      return activeQuestionTemplateName
        ? `Waiting for an answer to ${activeQuestionTemplateName}`
        : 'Waiting for the hider answer';
    case 'applying_constraints':
      return 'Updating the map';
    case 'awaiting_card_resolution':
      return 'Finishing a card effect';
    case 'cooldown':
      return 'Cooldown before the next clue';
    default:
      return 'Live play';
  }
}

function buildBaseFacts(args: BuildLiveGameplayGuideModelArgs): LiveGameplayFact[] {
  return [
    { label: 'Role', value: formatRoleLabel(args.role) },
    {
      label: 'Clue status',
      value: describeLiveClueStep(args.projection, args.activeQuestionTemplate?.name)
    },
    { label: 'Search area', value: args.currentSearchAreaLabel }
  ];
}

export function buildLiveGameplayGuideModel(
  args: BuildLiveGameplayGuideModelArgs
): LiveGameplayGuideModel {
  const baseFacts = buildBaseFacts(args);
  const activeQuestionPrompt =
    args.activeQuestionTemplate && args.activeQuestionCategory
      ? describeQuestionTemplateForPlayers(args.activeQuestionTemplate, args.activeQuestionCategory)
      : undefined;

  if (!args.projection) {
    return {
      badge: 'Match needed',
      title: 'Connect to a match first',
      detail: 'Create or join a match before the live map can guide the next action.',
      tone: 'warning',
      facts: [{ label: 'Status', value: 'No active match' }],
      actions: [{ label: 'Open Match Room', href: '/lobby', tone: 'secondary' }]
    };
  }

  if (args.projection.paused) {
    return {
      badge: 'Paused',
      title: 'Play is paused',
      detail: 'Stay on the live map, review the latest clue, and wait for play to resume.',
      tone: 'warning',
      facts: baseFacts,
      actions: [{ label: 'Open Chat', href: '/chat', tone: 'secondary' }]
    };
  }

  if (args.role === 'seeker') {
    if (
      args.projection.lifecycleState === 'seek_phase' &&
      (args.projection.seekPhaseSubstate === 'ready' ||
        args.projection.seekPhaseSubstate === 'awaiting_question_selection')
    ) {
      return {
        badge: 'Your move',
        title: 'Ask the next clue',
        detail:
          'Open the clue screen, use the workbook draw that is live for this match, and send the next question from there.',
        tone: 'success',
        facts: baseFacts,
        actions: [
          { label: 'Ask A Clue', href: '/questions', tone: 'primary' },
          { label: 'Open Chat', href: '/chat', tone: 'secondary' }
        ]
      };
    }

    if (
      args.projection.lifecycleState === 'seek_phase' &&
      args.projection.seekPhaseSubstate === 'awaiting_question_answer'
    ) {
      return {
        badge: 'Waiting',
        title: 'The hider is answering',
        detail:
          activeQuestionPrompt
            ? `The live clue is waiting for a response: ${activeQuestionPrompt}`
            : 'The live clue is waiting for the hider response.',
        tone: 'info',
        facts: [
          ...baseFacts,
          {
            label: 'Answer timer',
            value: args.activeQuestionTimerLabel ?? 'Waiting for live timer'
          }
        ],
        actions: [
          { label: 'Review The Clue', href: '/questions', tone: 'primary' },
          { label: 'Open Chat', href: '/chat', tone: 'secondary' }
        ],
        footnote: 'Stay on the map to watch for the next bounded update as soon as the answer lands.'
      };
    }

    if (
      args.projection.lifecycleState === 'seek_phase' &&
      args.projection.seekPhaseSubstate === 'cooldown'
    ) {
      return {
        badge: 'Cooldown',
        title: 'Use the latest clue on the map',
        detail:
          args.latestQuestionEffect?.mapEffectDetail ??
          'The latest clue has landed. Use the cooldown to plan the next move from the updated search area.',
        tone: args.latestQuestionEffect?.mapEffectTone ?? 'info',
        facts: baseFacts,
        actions: [
          { label: 'Review Latest Result', href: '/questions', tone: 'primary' },
          { label: 'Open Chat', href: '/chat', tone: 'secondary' }
        ]
      };
    }
  }

  if (args.role === 'hider') {
    if (
      args.projection.lifecycleState === 'seek_phase' &&
      args.projection.seekPhaseSubstate === 'awaiting_question_answer'
    ) {
      return {
        badge: 'Answer now',
        title: 'Respond to the live clue',
        detail:
          activeQuestionPrompt
            ? `Open the clue screen and answer this prompt: ${activeQuestionPrompt}`
            : 'Open the clue screen and send the hider answer now.',
        tone: 'warning',
        facts: [
          ...baseFacts,
          {
            label: 'Answer timer',
            value: args.activeQuestionTimerLabel ?? 'Waiting for live timer'
          }
        ],
        actions: [
          { label: 'Answer The Clue', href: '/questions', tone: 'primary' },
          ...(args.hasDeckAccess
            ? [{ label: 'Open Deck', href: '/cards', tone: 'secondary' } satisfies LiveGameplayAction]
            : [])
        ],
        footnote: 'Use the deck if you need response cards or a live card effect before sending the answer.'
      };
    }

    return {
      badge: 'Stay ready',
      title: 'Keep the hider hand ready',
      detail:
        args.hasDeckAccess
          ? `Watch the map, keep ${HIDER_HAND_TARGET} cards ready, and be prepared to answer the next clue quickly.`
          : 'Watch the map and stay ready for the next clue.',
      tone: 'info',
      facts: baseFacts,
      actions: args.hasDeckAccess
        ? [
            { label: 'Open Deck', href: '/cards', tone: 'primary' },
            { label: 'Open Chat', href: '/chat', tone: 'secondary' }
          ]
        : [{ label: 'Open Chat', href: '/chat', tone: 'secondary' } satisfies LiveGameplayAction]
    };
  }

  if (args.role === 'host') {
    if (
      args.projection.lifecycleState === 'seek_phase' &&
      args.projection.seekPhaseSubstate === 'applying_constraints'
    ) {
      return {
        badge: 'Resolve now',
        title: 'Update the map from the latest answer',
        detail:
          'Open the clue screen, apply the bounded result, and return here to confirm the new search area.',
        tone: 'warning',
        facts: baseFacts,
        actions: [
          { label: 'Apply Result', href: '/questions', tone: 'primary' },
          ...(args.hasDeckAccess
            ? [{ label: 'Open Deck', href: '/cards', tone: 'secondary' } satisfies LiveGameplayAction]
            : [])
        ]
      };
    }

    if (
      args.projection.lifecycleState === 'seek_phase' &&
      args.projection.seekPhaseSubstate === 'awaiting_question_answer'
    ) {
      return {
        badge: 'Support',
        title: 'The match is waiting for an answer',
        detail:
          'Stay on top of the live clue, then resolve it from the clue screen once the answer is in.',
        tone: 'info',
        facts: [
          ...baseFacts,
          {
            label: 'Answer timer',
            value: args.activeQuestionTimerLabel ?? 'Waiting for live timer'
          }
        ],
        actions: [
          { label: 'Open Questions', href: '/questions', tone: 'primary' },
          ...(args.hasDeckAccess
            ? [{ label: 'Open Deck', href: '/cards', tone: 'secondary' } satisfies LiveGameplayAction]
            : [])
        ]
      };
    }

    return {
      badge: 'Run play',
      title: 'Drive the next live step',
      detail:
        'Use the map as the shared source of truth, then open questions or the deck only when the next live action needs them.',
      tone: 'success',
      facts: baseFacts,
      actions: [
        { label: 'Open Questions', href: '/questions', tone: 'primary' },
        ...(args.hasDeckAccess
          ? [{ label: 'Open Deck', href: '/cards', tone: 'secondary' } satisfies LiveGameplayAction]
          : [])
      ]
    };
  }

  return {
    badge: 'Spectator',
    title: 'Follow the live map',
    detail:
      'Use the map to follow the current search area, then jump to chat when you need more context from the match.',
    tone: 'info',
    facts: baseFacts,
    actions: [
      { label: 'Open Chat', href: '/chat', tone: 'primary' },
      { label: 'Open Match Room', href: '/lobby', tone: 'secondary' }
    ]
  };
}

export function buildLiveDeckSummaryModel(
  args: BuildLiveDeckSummaryModelArgs
): LiveDeckSummaryModel | undefined {
  if (!args.projection || !args.hiderDeck) {
    return undefined;
  }

  if (args.role !== 'host' && args.role !== 'hider') {
    return undefined;
  }

  const handCount = args.hiderDeck.visibleByZone.hand.length;
  const pendingResolutionCount = args.hiderDeck.visibleByZone.pending_resolution.length;
  const cardsNeeded = Math.max(0, HIDER_HAND_TARGET - handCount);
  const activeClueLabel = args.activeQuestionCategory?.name ?? 'No live clue right now';

  if (pendingResolutionCount > 0 || args.projection.activeCardResolution?.sourceCardInstanceId) {
    return {
      title: 'A card effect still needs attention',
      detail:
        'Finish the open card effect from the deck screen before the live flow moves on.',
      facts: [
        { label: 'Pending effects', value: pendingResolutionCount },
        { label: 'Hand', value: `${handCount} / ${HIDER_HAND_TARGET}` },
        { label: 'Active clue', value: activeClueLabel }
      ],
      action: { label: 'Open Deck', href: '/cards', tone: 'primary' }
    };
  }

  if (cardsNeeded > 0) {
    return {
      title: 'Refill the hand before the next clue',
      detail: `The hider side should stay close to the target hand of ${HIDER_HAND_TARGET} cards.`,
      facts: [
        { label: 'Current hand', value: `${handCount} / ${HIDER_HAND_TARGET}` },
        { label: 'Need to draw', value: `${cardsNeeded}` },
        { label: 'Active clue', value: activeClueLabel }
      ],
      action: { label: 'Open Deck', href: '/cards', tone: 'primary' }
    };
  }

  return {
    title: 'Deck is ready for live play',
    detail:
      'The hider hand is full and ready. Open the deck when you need response cards or a card effect during the chase.',
    facts: [
      { label: 'Current hand', value: `${handCount} / ${HIDER_HAND_TARGET}` },
      { label: 'Active clue', value: activeClueLabel },
      { label: 'Visible discards', value: args.hiderDeck.visibleByZone.discard_pile.length }
    ],
    action: { label: 'Open Deck', href: '/cards', tone: 'secondary' }
  };
}
