import type {
  CardDefinition,
  ContentPack,
  DeckDefinition,
  MatchProjection,
  MatchRole,
  VisibleCardProjection
} from '../../../../../packages/shared-types/src/index.ts';

export type CardZoneView = 'draw_pile' | 'hand' | 'discard_pile' | 'exile' | 'pending_resolution';

export interface ResolvedVisibleCardModel {
  card: VisibleCardProjection;
  definition: CardDefinition;
  deck: DeckDefinition;
}

export interface DeckViewModel {
  deck: DeckDefinition;
  visibleCards: ResolvedVisibleCardModel[];
  visibleByZone: Record<CardZoneView, ResolvedVisibleCardModel[]>;
}

function emptyZones(): Record<CardZoneView, ResolvedVisibleCardModel[]> {
  return {
    draw_pile: [],
    hand: [],
    discard_pile: [],
    exile: [],
    pending_resolution: []
  };
}

export function resolveCurrentRole(role: string | undefined, scope: string | undefined): MatchRole {
  if (role === 'host' || scope === 'host_admin') {
    return 'host';
  }

  if (role === 'hider') {
    return 'hider';
  }

  if (role === 'seeker') {
    return 'seeker';
  }

  return 'spectator';
}

export function canRoleUseDeck(role: MatchRole, deck: DeckDefinition): boolean {
  if (role === 'host') {
    return true;
  }

  if (role === 'hider') {
    return deck.ownerScope === 'hider_team' || deck.ownerScope === 'hider_player' || deck.ownerScope === 'shared_public';
  }

  if (role === 'seeker') {
    return deck.ownerScope === 'seeker_team' || deck.ownerScope === 'seeker_player' || deck.ownerScope === 'shared_public';
  }

  return false;
}

function sortCards(cards: ResolvedVisibleCardModel[]): ResolvedVisibleCardModel[] {
  return [...cards].sort((left, right) => {
    const nameCompare = left.definition.name.localeCompare(right.definition.name);
    return nameCompare !== 0
      ? nameCompare
      : left.card.cardInstanceId.localeCompare(right.card.cardInstanceId);
  });
}

export function buildDeckViewModels(
  contentPack: ContentPack,
  projection: MatchProjection | undefined,
  role: MatchRole
): DeckViewModel[] {
  const deckMap = new Map(contentPack.decks.map((deck) => [deck.deckId, deck]));
  const cardsByDeck = new Map<string, ResolvedVisibleCardModel[]>();

  for (const visibleCard of projection?.visibleCards ?? []) {
    const definition = contentPack.cards.find((card) => card.cardDefinitionId === visibleCard.cardDefinitionId);
    if (!definition) {
      continue;
    }

    const deck = deckMap.get(definition.deckId);
    if (!deck) {
      continue;
    }

    const resolvedCard: ResolvedVisibleCardModel = {
      card: visibleCard,
      definition,
      deck
    };
    const existing = cardsByDeck.get(deck.deckId) ?? [];
    existing.push(resolvedCard);
    cardsByDeck.set(deck.deckId, existing);
  }

  return contentPack.decks
    .filter((deck) => canRoleUseDeck(role, deck) || (cardsByDeck.get(deck.deckId)?.length ?? 0) > 0)
    .map((deck) => {
      const visibleCards = sortCards(cardsByDeck.get(deck.deckId) ?? []);
      const visibleByZone = emptyZones();
      for (const card of visibleCards) {
        const zone = card.card.zone as CardZoneView;
        if (zone in visibleByZone) {
          visibleByZone[zone].push(card);
        }
      }

      return {
        deck,
        visibleCards,
        visibleByZone
      };
    })
    .sort((left, right) => left.deck.name.localeCompare(right.deck.name));
}

export function findResolvedVisibleCard(
  deckViewModels: DeckViewModel[],
  cardInstanceId: string | undefined
): ResolvedVisibleCardModel | undefined {
  if (!cardInstanceId) {
    return undefined;
  }

  for (const deckViewModel of deckViewModels) {
    const match = deckViewModel.visibleCards.find((card) => card.card.cardInstanceId === cardInstanceId);
    if (match) {
      return match;
    }
  }

  return undefined;
}

export function pickDefaultCardInstanceId(deckViewModel: DeckViewModel | undefined): string | undefined {
  if (!deckViewModel) {
    return undefined;
  }

  return deckViewModel.visibleByZone.hand[0]?.card.cardInstanceId
    ?? deckViewModel.visibleByZone.pending_resolution[0]?.card.cardInstanceId
    ?? deckViewModel.visibleCards[0]?.card.cardInstanceId;
}

export function formatAutomationLevel(automationLevel: CardDefinition['automationLevel']): string {
  if (automationLevel === 'authoritative') {
    return 'Authoritative';
  }

  if (automationLevel === 'assisted') {
    return 'Assisted';
  }

  return 'Manual';
}

export function describeEffectSupport(cardDefinition: CardDefinition): string {
  if (cardDefinition.automationLevel === 'authoritative') {
    return 'This card resolves through the current engine path without opening a manual card window.';
  }

  if (cardDefinition.automationLevel === 'assisted') {
    return 'This card opens an assisted resolution window. Review its text and close the window when the effect is handled.';
  }

  return 'This card is manual. The screen records state honestly and leaves the effect to players or a referee.';
}

export function canDrawCards(projection: MatchProjection | undefined): boolean {
  return projection?.lifecycleState === 'hide_phase' ||
    (projection?.lifecycleState === 'seek_phase' &&
      (
        projection.seekPhaseSubstate === 'ready' ||
        projection.seekPhaseSubstate === 'applying_constraints' ||
        projection.seekPhaseSubstate === 'cooldown'
      ));
}

export function canPlayCards(projection: MatchProjection | undefined): boolean {
  return projection?.lifecycleState === 'hide_phase' ||
    projection?.lifecycleState === 'endgame' ||
    (projection?.lifecycleState === 'seek_phase' &&
      (
        projection.seekPhaseSubstate === 'ready' ||
        projection.seekPhaseSubstate === 'applying_constraints' ||
        projection.seekPhaseSubstate === 'awaiting_card_resolution' ||
        projection.seekPhaseSubstate === 'cooldown'
      ));
}

export function canDiscardCards(projection: MatchProjection | undefined): boolean {
  return projection?.lifecycleState === 'seek_phase' &&
    (
      projection.seekPhaseSubstate === 'ready' ||
      projection.seekPhaseSubstate === 'awaiting_card_resolution' ||
      projection.seekPhaseSubstate === 'cooldown'
    );
}

export function canResolveCardWindow(role: MatchRole, projection: MatchProjection | undefined): boolean {
  return role === 'host' && Boolean(projection?.activeCardResolution?.sourceCardInstanceId);
}
