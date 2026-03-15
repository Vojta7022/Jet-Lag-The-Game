import type {
  CardDefinition,
  DeckDefinition,
  MatchRole
} from '../../../../../packages/shared-types/src/index.ts';

import type {
  CardZoneView,
  DeckViewModel,
  ResolvedVisibleCardModel
} from './card-catalog.ts';

export type CardUiTone = 'info' | 'warning' | 'success';

export interface CardBehaviorModel {
  label: string;
  tone: CardUiTone;
  detail: string;
}

export interface CardActionStateModel {
  statusSummary: string;
  playReason?: string;
  discardReason?: string;
}

const WEAK_CARD_DESCRIPTION_PATTERNS = [
  /not defined in the workbook/i,
  /resolve manually\./i,
  /^tbd$/i,
  /^todo$/i
];

function isWeakCardDescription(description: string | undefined): boolean {
  const trimmed = description?.trim() ?? '';
  if (trimmed.length === 0) {
    return true;
  }

  return WEAK_CARD_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function formatDeckOwnerScope(ownerScope: DeckDefinition['ownerScope']): string {
  switch (ownerScope) {
    case 'hider_team':
      return 'Hider team deck';
    case 'seeker_team':
      return 'Seeker team deck';
    case 'hider_player':
      return 'Private hider deck';
    case 'seeker_player':
      return 'Private seeker deck';
    case 'shared_public':
      return 'Public shared deck';
    case 'host_only':
      return 'Host-only deck';
  }
}

export function formatZoneLabel(zone: CardZoneView): string {
  switch (zone) {
    case 'draw_pile':
      return 'Draw pile';
    case 'hand':
      return 'Hand';
    case 'discard_pile':
      return 'Discard pile';
    case 'exile':
      return 'Exile';
    case 'pending_resolution':
      return 'Pending resolution';
  }
}

export function formatCardKindLabel(kind: CardDefinition['kind']): string {
  switch (kind) {
    case 'time_bonus':
      return 'Time bonus';
    case 'power_up':
      return 'Power-up';
    case 'curse':
      return 'Curse';
    case 'blank':
      return 'Blank';
    default:
      return kind.replace(/_/g, ' ');
  }
}

export function buildCardBehaviorModel(cardDefinition: CardDefinition): CardBehaviorModel {
  if (cardDefinition.automationLevel === 'authoritative') {
    return {
      label: 'Authoritative',
      tone: 'success',
      detail: 'The engine applies this card directly. If play succeeds, the runtime should move the card without a manual referee step.'
    };
  }

  if (cardDefinition.automationLevel === 'assisted') {
    return {
      label: 'Assisted',
      tone: 'warning',
      detail: 'The runtime opens a resolution window and expects players or a referee to help finish the effect honestly.'
    };
  }

  return {
    label: 'Manual',
    tone: 'info',
    detail: 'This card stays manual. The app records card state and window locks, but it does not invent unresolved effect automation.'
  };
}

export function buildCardPurposeSummary(cardDefinition: CardDefinition): string {
  switch (cardDefinition.kind) {
    case 'time_bonus':
      return 'Gives extra time when the match rules allow this card to resolve.';
    case 'power_up':
      return 'Creates a special advantage that players or the referee must handle honestly.';
    case 'curse':
      return 'Applies a setback or restriction that players must keep track of honestly.';
    case 'blank':
      return 'Acts as a filler card unless a future content pack gives it a custom meaning.';
    default:
      return 'Creates a match effect that follows the current rules and card window state.';
  }
}

export function buildCardDescription(cardDefinition: CardDefinition): string {
  if (!isWeakCardDescription(cardDefinition.description)) {
    return cardDefinition.description.trim();
  }

  const effectDescriptions = cardDefinition.effects
    .map((effect) => effect.description?.trim())
    .filter((description): description is string => Boolean(description) && !WEAK_CARD_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(description)));

  if (effectDescriptions.length > 0) {
    return effectDescriptions[0]!;
  }

  return buildCardPurposeSummary(cardDefinition);
}

export function buildCardRestrictionSummary(cardDefinition: CardDefinition): string {
  const restrictions = [
    ...buildCardRequirementLines(cardDefinition),
    ...buildCardTimingLines(cardDefinition)
  ];

  if (restrictions.length === 0) {
    return 'No extra timing or requirement notes are exposed in this content pack yet.';
  }

  return restrictions[0]!;
}

export function describeDeckVisibility(deck: DeckDefinition, role: MatchRole): string {
  if (role === 'host') {
    return 'Host-admin views can inspect every visible pile that the current projection exposes.';
  }

  if (role === 'spectator') {
    return 'Spectator views stay read-only and only reveal card state when the current projection scope allows it.';
  }

  if (deck.ownerScope === 'shared_public') {
    return 'This deck can appear in public scopes when the projection allows it.';
  }

  return 'Private deck contents only appear when the current role and projection scope are allowed to see them.';
}

export function summarizeVisibleDeckCounts(deckViewModel: DeckViewModel): string {
  const visibleCount = deckViewModel.visibleCards.length;
  const pendingCount = deckViewModel.visibleByZone.pending_resolution.length;

  return pendingCount > 0
    ? `${visibleCount} visible cards, including ${pendingCount} awaiting resolution`
    : `${visibleCount} visible cards in the current scope`;
}

export function buildCardListSubtitle(card: ResolvedVisibleCardModel): string {
  const shortName = card.definition.shortName?.trim();
  const kind = formatCardKindLabel(card.definition.kind);
  const behavior = buildCardBehaviorModel(card.definition).label;
  const zone = formatZoneLabel(card.card.zone as CardZoneView);

  return [shortName && shortName !== card.definition.name ? shortName : undefined, kind, behavior, zone]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

export function buildCardScaleNotes(cardDefinition: CardDefinition): string[] {
  return cardDefinition.effects.flatMap((effect) => {
    const payload = effect.payload as
      | {
          minutesByScale?: Partial<Record<'small' | 'medium' | 'large', number>>;
        }
      | undefined;

    if (!payload?.minutesByScale) {
      return [];
    }

    const minutes = payload.minutesByScale;
    const parts = [
      minutes.small !== undefined ? `Small: +${minutes.small}m` : undefined,
      minutes.medium !== undefined ? `Medium: +${minutes.medium}m` : undefined,
      minutes.large !== undefined ? `Large: +${minutes.large}m` : undefined
    ].filter((value): value is string => Boolean(value));

    return parts.length > 0 ? [`Scale effect: ${parts.join(' · ')}`] : [];
  });
}

export function buildCardRequirementLines(cardDefinition: CardDefinition): string[] {
  const lines: string[] = [];

  for (const cost of cardDefinition.castingCost ?? []) {
    lines.push(`Cost: ${cost.description}`);
  }

  for (const precondition of cardDefinition.preconditions ?? []) {
    lines.push(`Needs: ${precondition.description}`);
  }

  if (cardDefinition.requirements?.requiresPhotoUpload) {
    lines.push('Needs photo evidence.');
  }

  if (cardDefinition.requirements?.requiresManualApproval) {
    lines.push('Needs manual approval.');
  }

  if (cardDefinition.requirements?.requiresDiceRoll) {
    lines.push('Needs a dice roll.');
  }

  if (cardDefinition.requirements?.requiresLocationSelection) {
    lines.push('Needs a location choice.');
  }

  return lines;
}

export function buildCardTimingLines(cardDefinition: CardDefinition): string[] {
  const lines: string[] = [];

  if (cardDefinition.timingWindow?.allowedPhases?.length) {
    lines.push(`Playable during: ${cardDefinition.timingWindow.allowedPhases.join(', ')}`);
  }

  if (cardDefinition.timingWindow?.trigger) {
    lines.push(`Trigger: ${cardDefinition.timingWindow.trigger}`);
  }

  if (cardDefinition.durationPolicy?.kind === 'fixed' && cardDefinition.durationPolicy.durationSeconds) {
    lines.push(`Duration: ${cardDefinition.durationPolicy.durationSeconds}s`);
  }

  return lines;
}

export function buildCardActionState(args: {
  card?: ResolvedVisibleCardModel;
  viewerRole: MatchRole;
  canPlay: boolean;
  canDiscard: boolean;
  lockReason?: string;
}): CardActionStateModel {
  if (!args.card) {
    return {
      statusSummary: 'Select a card to see what can happen next.'
    };
  }

  if (args.viewerRole === 'spectator') {
    return {
      statusSummary: 'This is a read-only spectator view.',
      playReason: 'Spectators cannot play cards.',
      discardReason: 'Spectators cannot discard cards.'
    };
  }

  if (args.lockReason) {
    return {
      statusSummary: 'Another card window is blocking new card actions.',
      playReason: args.lockReason,
      discardReason: args.lockReason
    };
  }

  if (args.card.card.zone !== 'hand') {
    return {
      statusSummary: `This card is currently in ${formatZoneLabel(args.card.card.zone as CardZoneView)}.`,
      playReason: 'Only cards in hand can be played from this screen.',
      discardReason: 'Only cards in hand can be discarded from this screen.'
    };
  }

  return {
    statusSummary: args.canPlay || args.canDiscard
      ? 'This card is in hand and ready for any actions the current match state allows.'
      : 'This card is in hand, but the current match state does not allow a card action right now.',
    playReason: args.canPlay ? undefined : 'Play is not currently allowed by the active match state.',
    discardReason: args.canDiscard ? undefined : 'Discard is not currently allowed by the active match state.'
  };
}

export function buildResolutionWindowGuidance(
  activeCard: ResolvedVisibleCardModel | undefined,
  canResolve: boolean
) {
  if (!activeCard) {
    return {
      title: 'No active resolution window',
      detail: 'Manual and assisted cards will appear here when a play opens a card window.',
      nextStep: 'Continue drawing, selecting, or reviewing cards.'
    };
  }

  const behavior = buildCardBehaviorModel(activeCard.definition);

  return {
    title: `${behavior.label} card awaiting resolution`,
    detail: behavior.detail,
    nextStep: canResolve
      ? 'Review the card text, handle the effect honestly, and close the window when play can continue.'
      : 'A host-admin view must close this card window after the effect is handled.'
  };
}
