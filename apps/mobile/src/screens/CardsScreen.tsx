import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildCardActionState,
  buildCardBehaviorModel,
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
  describeDeckVisibility,
  findResolvedVisibleCard,
  formatDeckOwnerScope,
  pickDefaultCardInstanceId,
  resolveCurrentRole
} from '../features/cards/index.ts';
import {
  buildEvidenceContexts,
  EvidenceCapturePanel,
  useLocalMediaAttachments,
  type LocalEvidenceContextDescriptor
} from '../features/evidence/index.ts';
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
  const { state, submitCommand, submitCommands, refreshActiveMatch, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
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
  const selectedDeckVisibility = selectedDeck
    ? describeDeckVisibility(selectedDeck.deck, viewerRole)
    : 'Select a deck to review its visible hand and piles.';
  const selectedCardActionState = buildCardActionState({
    card: selectedCard,
    viewerRole,
    canPlay,
    canDiscard,
    lockReason
  });
  const activeCardBehavior = activeCard ? buildCardBehaviorModel(activeCard.definition) : undefined;
  const evidenceContexts = useMemo(
    () => buildEvidenceContexts(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const activeCardEvidenceContext = evidenceContexts.find((context) => context.kind === 'card');
  const cardAttachmentContext = useMemo<LocalEvidenceContextDescriptor | undefined>(
    () =>
      activeCardEvidenceContext
        ? {
            contextId: activeCardEvidenceContext.contextId,
            kind: 'card',
            title: activeCardEvidenceContext.title,
            detail: activeCardEvidenceContext.detail,
            visibilityScope: activeCardEvidenceContext.suggestedVisibilityScope,
            attachmentKind: 'photo_evidence',
            cardInstanceId: activeCardEvidenceContext.cardInstanceId
          }
        : undefined,
    [activeCardEvidenceContext]
  );
  const cardEvidenceDrafts = cardAttachmentContext
    ? localMedia.getContextDrafts(cardAttachmentContext.contextId)
    : [];
  const resolveDisabledReason = activeCard && !canResolve
    ? 'A host-admin view must close the active card window after the effect is handled.'
    : undefined;
  const cardEvidenceHint = activeMatch?.onlineStatus?.attachmentStorageMode === 'durable_supabase_storage'
    ? 'Recording evidence here uploads the image to Supabase Storage and records durable attachment metadata in the match.'
    : activeMatch?.runtimeKind === 'online_foundation'
      ? 'Recording evidence here still creates real attachment records, but this online session is not yet writing shared media binaries.'
      : 'Recording media here creates attachment metadata in the match. Binary storage and later review workflows are still partial, so this screen stays explicit about what is and is not persisted.';

  const handleRecordCardEvidence = async () => {
    if (!cardAttachmentContext) {
      return;
    }

    const attachmentIds = cardEvidenceDrafts.map((draft) => draft.attachmentId);
    const commands = await prepareAttachmentUploadCommands(cardEvidenceDrafts);
    if (!commands || commands.length === 0) {
      return;
    }

    localMedia.markSubmitting(attachmentIds);
    const succeeded = await submitCommands(commands);
    if (succeeded) {
      localMedia.markSubmitted(attachmentIds);
      return;
    }

    localMedia.resetToSelected(attachmentIds);
  };

  return (
    <ScreenContainer
      title="Cards"
      subtitle="Review visible hands and piles, understand what each card can really do, and manage card windows through the live match flow."
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
          detail="Spectators cannot inspect private hands or perform card actions. Only card state exposed by the current projection scope is visible here."
        />
      ) : null}

      {activeCard && activeCardBehavior ? (
        <StateBanner
          tone={activeCardBehavior.tone}
          title={`${activeCardBehavior.label} card window is open`}
          detail={activeCardBehavior.detail}
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
        subtitle="Visibility, hand access, and card-lock rules for the current role."
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
            { label: 'Visible Decks', value: deckViewModels.length },
            { label: 'State Update', value: timingModel?.freshnessLabel ?? 'Waiting for live state' }
          ]}
        />
        <Text style={styles.copy}>
          Draw, play, discard, and resolution controls respect the real state machine. Manual and assisted cards never claim automated effects that the engine does not actually perform.
        </Text>
      </Panel>

      <Panel
        title="Deck Actions"
        subtitle="Prepare the match for card play, draw from a visible deck, or refresh the live card state."
      >
        <AppButton
          label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Card Play'}
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
          label={selectedDeck ? `Draw From ${selectedDeck.deck.name}` : 'Draw A Card'}
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

      <Panel
        title="Decks"
        subtitle="Choose a deck to inspect its visible hand, draw pile, discard pile, exile, and any pending card windows."
      >
        {deckViewModels.length === 0 ? (
          <Text style={styles.copy}>
            No accessible decks are visible in the current role and scope. For shared team hands, a private team-scoped connection may reveal more than a public scope.
          </Text>
        ) : (
          <CardDeckList
            decks={deckViewModels}
            selectedDeckId={selectedDeck?.deck.deckId}
            viewerRole={viewerRole}
            onSelect={setSelectedDeckId}
          />
        )}
      </Panel>

      {selectedDeck ? (
        <>
          <Panel
            title="Selected Deck"
            subtitle="Understand who this deck belongs to, what is visible now, and whether anything is waiting for resolution."
          >
            <FactList
              items={[
                { label: 'Deck', value: selectedDeck.deck.name },
                { label: 'Ownership', value: formatDeckOwnerScope(selectedDeck.deck.ownerScope) },
                { label: 'Visible Cards', value: selectedDeck.visibleCards.length },
                { label: 'Pending Windows', value: selectedDeck.visibleByZone.pending_resolution.length }
              ]}
            />
            <Text style={styles.copy}>{selectedDeckVisibility}</Text>
          </Panel>

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
            title="Pending Resolution"
            subtitle="Cards currently locked in a resolution window for the selected deck."
          >
            <CardZoneSection
              title="Cards Awaiting Resolution"
              cards={selectedDeck.visibleByZone.pending_resolution}
              emptyText="No pending-resolution cards are visible in this deck right now."
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
        subtitle="Review the currently selected card, how it resolves, and which actions are honestly available right now."
      >
        <CardDetailPanel
          card={selectedCard}
          viewerRole={viewerRole}
          disabled={state.loadState === 'loading'}
          lockReason={lockReason}
          canPlay={canPlay}
          canDiscard={canDiscard}
          playDisabledReason={selectedCardActionState.playReason}
          discardDisabledReason={selectedCardActionState.discardReason}
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
        subtitle="Track manual or assisted card windows that still need referee action before play can continue."
      >
        <CardResolutionStatusPanel
          activeCard={activeCard}
          canResolve={canResolve}
          resolveDisabledReason={resolveDisabledReason}
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

      {cardAttachmentContext ? (
        <Panel
          title="Card Evidence"
          subtitle="Record supporting media for cards that require evidence without pretending the effect is already automated."
        >
          <EvidenceCapturePanel
            context={cardAttachmentContext}
            drafts={cardEvidenceDrafts}
            visibleAttachments={activeCardEvidenceContext?.attachments ?? []}
            disabled={!activeMatch || state.loadState === 'loading' || viewerRole === 'spectator'}
            busy={localMedia.isContextBusy(cardAttachmentContext.contextId)}
            feedback={localMedia.getContextFeedback(cardAttachmentContext.contextId)}
            localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
            submitLabel="Record Card Evidence"
            submitDisabled={cardEvidenceDrafts.length === 0}
            submitHint={cardEvidenceHint}
            emptyVisibleText="No visible card evidence has been recorded for the active window yet."
            onChooseFromLibrary={() => {
              void localMedia.chooseFromLibrary(cardAttachmentContext);
            }}
            onTakePhoto={() => {
              void localMedia.takePhoto(cardAttachmentContext);
            }}
            onUpdateDraft={localMedia.updateDraft}
            onRemoveDraft={localMedia.removeDraft}
            onSubmitSelected={() => {
              void handleRecordCardEvidence();
            }}
          />
        </Panel>
      ) : null}
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
