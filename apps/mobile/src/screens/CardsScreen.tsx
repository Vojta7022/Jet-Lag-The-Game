import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  CardDeckList,
  CardDetailPanel,
  CardResolutionStatusPanel,
  CardZoneSection,
  buildCardFlowBootstrapCommands,
  buildDeckViewModels,
  canDiscardCards,
  canDrawCards,
  canPlayCards,
  canResolveCardWindow,
  findResolvedVisibleCard,
  pickDefaultCardInstanceId,
  resolveCurrentRole
} from '../features/cards/index.ts';
import {
  MatchTimingBanner,
  MatchTimingPanel,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function CardsScreen() {
  const { state, submitCommand, submitCommands, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, state.lastSync?.generatedAt);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const deckViewModels = useMemo(
    () => buildDeckViewModels(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const [selectedDeckId, setSelectedDeckId] = useState<string | undefined>(deckViewModels[0]?.deck.deckId);
  const selectedDeck = deckViewModels.find((deck) => deck.deck.deckId === selectedDeckId) ?? deckViewModels[0];
  const [selectedCardInstanceId, setSelectedCardInstanceId] = useState<string | undefined>(
    pickDefaultCardInstanceId(selectedDeck)
  );
  const selectedCard = findResolvedVisibleCard(deckViewModels, selectedCardInstanceId);
  const activeCard = findResolvedVisibleCard(deckViewModels, projection?.activeCardResolution?.sourceCardInstanceId);

  useEffect(() => {
    if (!selectedDeckId && deckViewModels[0]) {
      setSelectedDeckId(deckViewModels[0].deck.deckId);
    }
  }, [deckViewModels, selectedDeckId]);

  useEffect(() => {
    if (!selectedDeck || selectedDeck.deck.deckId !== selectedDeckId) {
      setSelectedDeckId(selectedDeck?.deck.deckId);
    }
  }, [selectedDeck, selectedDeckId]);

  useEffect(() => {
    const availableCardIds = new Set(selectedDeck?.visibleCards.map((card) => card.card.cardInstanceId) ?? []);
    if (!selectedCardInstanceId || !availableCardIds.has(selectedCardInstanceId)) {
      setSelectedCardInstanceId(pickDefaultCardInstanceId(selectedDeck));
    }
  }, [selectedCardInstanceId, selectedDeck]);

  const canPrepareFlow = Boolean(
    activeMatch &&
      viewerRole === 'host' &&
      projection &&
      ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup', 'hide_phase'].includes(
        projection.lifecycleState
      )
  );
  const lockReason =
    projection?.activeCardResolution?.sourceCardInstanceId &&
    selectedCard &&
    projection.activeCardResolution.sourceCardInstanceId !== selectedCard.card.cardInstanceId
      ? 'Another card window is already active. Only the pending-resolution card can be closed right now.'
      : undefined;
  const canDraw = Boolean(
    activeMatch &&
      selectedDeck &&
      canDrawCards(projection) &&
      viewerRole !== 'spectator'
  );
  const canPlay = Boolean(
    activeMatch &&
      selectedCard &&
      selectedCard.card.zone === 'hand' &&
      canPlayCards(projection) &&
      !lockReason &&
      viewerRole !== 'spectator'
  );
  const canDiscard = Boolean(
    activeMatch &&
      selectedCard &&
      selectedCard.card.zone === 'hand' &&
      canDiscardCards(projection) &&
      viewerRole !== 'spectator'
  );
  const canResolve = Boolean(
    activeMatch &&
      canResolveCardWindow(viewerRole, projection)
  );

  return (
    <ScreenContainer
      title="Cards"
      subtitle="Review visible hands and piles, then play or discard cards through the live match flow."
      topSlot={<ProductNavBar current="cards" />}
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Card actions only run through an active runtime connection."
        />
      ) : null}

      {activeMatch && viewerRole === 'spectator' ? (
        <StateBanner
          tone="info"
          title="Read-only spectator view"
          detail="Spectators cannot inspect private hands or perform card actions. Public card state remains hidden unless the active scope allows it."
        />
      ) : null}

      <MatchTimingBanner model={timingModel} />

      {activeMatch ? (
        <Panel
          title="Match Timing"
          subtitle="Card play respects the current hide timer, question cooldown, pause state, and resolution lock."
        >
          <MatchTimingPanel model={timingModel} />
        </Panel>
      ) : null}

      <Panel
        title="Card Context"
        subtitle="Visibility, state, and card-lock rules for the current role."
      >
        <FactList
          items={[
            { label: 'Role', value: viewerRole },
            {
              label: 'Stage',
              value: projection?.seekPhaseSubstate
                ? `${projection.lifecycleState} / ${projection.seekPhaseSubstate}`
                : projection?.lifecycleState ?? 'Unavailable'
            },
            { label: 'Scope', value: activeMatch?.recipient.scope ?? 'None' },
            { label: 'Visible Decks', value: deckViewModels.length }
          ]}
        />
        <Text style={styles.copy}>
          Draw/play/discard actions respect the real state machine. Manual and assisted cards never claim automated effects that the engine does not actually perform.
        </Text>
      </Panel>

      <Panel
        title="Deck Actions"
        subtitle="Prepare the match for card use, draw from a visible deck, or refresh the current state."
      >
        <AppButton
          label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Cards'}
          onPress={() => {
            if (!projection) {
              return;
            }

            const commands = buildCardFlowBootstrapCommands(projection);
            if (commands.length === 0) {
              void refreshActiveMatch();
              return;
            }

            void submitCommands(commands);
          }}
          disabled={!canPrepareFlow || state.loadState === 'loading'}
        />
        <AppButton
          label={selectedDeck ? `Draw From ${selectedDeck.deck.name}` : 'Draw Card'}
          onPress={() => {
            if (!selectedDeck) {
              return;
            }

            void submitCommand({
              type: 'draw_card',
              payload: {
                deckId: selectedDeck.deck.deckId
              }
            });
          }}
          disabled={!canDraw || state.loadState === 'loading'}
        />
        <AppButton
          label="Refresh Cards"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || state.loadState === 'loading'}
        />
      </Panel>

      <Panel
        title="Decks"
        subtitle="Choose a deck to inspect its visible hand, draw pile, discard pile, and exile."
      >
        {deckViewModels.length === 0 ? (
          <Text style={styles.copy}>
            No accessible decks are visible in the current role and scope. For shared team hands, a private team-scoped connection may reveal more than a public scope.
          </Text>
        ) : (
          <CardDeckList
            decks={deckViewModels}
            selectedDeckId={selectedDeck?.deck.deckId}
            onSelect={setSelectedDeckId}
          />
        )}
      </Panel>

      {selectedDeck ? (
        <>
          <Panel
            title="Hand"
            subtitle="Cards currently visible in hand for the selected deck."
          >
            <CardZoneSection
              title={`${selectedDeck.deck.name} Hand`}
              cards={selectedDeck.visibleByZone.hand}
              emptyText="No visible hand cards in the current scope."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Draw Pile"
            subtitle="Cards remaining to be drawn when the current scope allows draw-pile visibility."
          >
            <CardZoneSection
              title="Visible Draw Pile"
              cards={selectedDeck.visibleByZone.draw_pile}
              emptyText={
                viewerRole === 'host'
                  ? 'The visible draw pile is empty.'
                  : 'Draw-pile contents are hidden in this scope unless the projection explicitly allows them.'
              }
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Discard Pile"
            subtitle="Cards already spent or revealed from the selected deck."
          >
            <CardZoneSection
              title="Visible Discards"
              cards={selectedDeck.visibleByZone.discard_pile}
              emptyText="No visible discarded cards for this deck yet."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Removed / Exile"
            subtitle="Cards that are no longer active in the selected deck."
          >
            <CardZoneSection
              title="Visible Exiled Cards"
              cards={selectedDeck.visibleByZone.exile}
              emptyText="No visible exiled cards for this deck."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>
        </>
      ) : null}

      <Panel
        title="Card Detail"
        subtitle="Review the currently selected card before taking an action."
      >
        <CardDetailPanel
          card={selectedCard}
          disabled={state.loadState === 'loading'}
          lockReason={lockReason}
          canPlay={canPlay}
          canDiscard={canDiscard}
          onPlay={() => {
            if (!selectedCard) {
              return;
            }

            void submitCommand({
              type: 'play_card',
              payload: {
                cardInstanceId: selectedCard.card.cardInstanceId
              }
            });
          }}
          onDiscard={() => {
            if (!selectedCard) {
              return;
            }

            void submitCommand({
              type: 'discard_card',
              payload: {
                cardInstanceId: selectedCard.card.cardInstanceId
              }
            });
          }}
        />
      </Panel>

      <Panel
        title="Resolution Status"
        subtitle="Track manual or assisted card windows that still need referee action."
      >
        <CardResolutionStatusPanel
          activeCard={activeCard}
          canResolve={canResolve}
          disabled={state.loadState === 'loading'}
          onResolve={() => {
            if (!projection?.activeCardResolution?.sourceCardInstanceId) {
              return;
            }

            void submitCommand({
              type: 'resolve_card_window',
              payload: {
                sourceCardInstanceId: projection.activeCardResolution.sourceCardInstanceId
              }
            });
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
