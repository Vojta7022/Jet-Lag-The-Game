import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function CardsScreen() {
  const { state, submitCommand, submitCommands, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
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
      subtitle="First-pass hand, deck, and card-window UI wired to the real card runtime contracts."
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

      <Panel title="Card Runtime Status">
        <View style={styles.row}>
          <Text style={styles.label}>Viewer Role</Text>
          <Text style={styles.value}>{viewerRole}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Lifecycle</Text>
          <Text style={styles.value}>
            {projection?.lifecycleState}
            {projection?.seekPhaseSubstate ? ` / ${projection.seekPhaseSubstate}` : ''}
          </Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Scope</Text>
          <Text style={styles.value}>{activeMatch?.recipient.scope ?? 'none'}</Text>
        </View>
        <Text style={styles.copy}>
          Draw/play/discard actions respect the real state machine. Manual and assisted cards never claim automated effects that the engine does not actually perform.
        </Text>
      </Panel>

      <Panel title="Deck Actions">
        <AppButton
          label={state.loadState === 'loading' ? 'Working...' : 'Prepare Demo Card Flow'}
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
          label="Refresh Card State"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || state.loadState === 'loading'}
        />
      </Panel>

      <Panel title="Decks">
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
          <Panel title="Hand">
            <CardZoneSection
              title={`${selectedDeck.deck.name} Hand`}
              cards={selectedDeck.visibleByZone.hand}
              emptyText="No visible hand cards in the current scope."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel title="Draw Pile">
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

          <Panel title="Discard Pile">
            <CardZoneSection
              title="Visible Discards"
              cards={selectedDeck.visibleByZone.discard_pile}
              emptyText="No visible discarded cards for this deck yet."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel title="Removed / Exile">
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

      <Panel title="Card Detail">
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

      <Panel title="Resolution Status">
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
