import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildCardActionState,
  buildCardWorkbookPlayability,
  buildCardBehaviorModel,
  CardDeckList,
  CardDetailPanel,
  CardResolutionStatusPanel,
  CardZoneSection,
  buildQuestionResponseCardReason,
  buildCardFlowBootstrapCommands,
  buildDeckViewModels,
  canDiscardCards,
  canDrawCards,
  canPlayCards,
  canResolveCardWindow,
  describeDeckVisibility,
  findResolvedVisibleCard,
  formatDeckOwnerScope,
  HIDER_HAND_TARGET,
  pickDefaultCardInstanceId,
  resolveCurrentRole
} from '../features/cards/index.ts';
import {
  filterCardIdsByVisibleHand,
  haveSameCardIdSequence,
  reconcileDrawTrayCardIds
} from '../features/cards/deck-ui-state.ts';
import {
  findActiveQuestion,
  findQuestionCategory
} from '../features/questions/index.ts';
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

function formatRoleLabel(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function describeDeckFlowStep(lifecycleState: string | undefined, seekPhaseSubstate: string | undefined) {
  if (!lifecycleState) {
    return 'Waiting for the live match';
  }

  if (lifecycleState === 'hide_phase') {
    return 'Draw up and prepare the hand';
  }

  if (lifecycleState === 'endgame') {
    return 'Use the last card effects carefully';
  }

  if (lifecycleState === 'game_complete') {
    return 'Match complete';
  }

  if (lifecycleState !== 'seek_phase') {
    return lifecycleState.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  }

  switch (seekPhaseSubstate) {
    case 'ready':
      return 'Keep the hand ready for the next clue';
    case 'awaiting_question_answer':
      return 'Prepare response cards while the clue is live';
    case 'awaiting_card_resolution':
      return 'Resolve the open card effect';
    case 'applying_constraints':
      return 'Hold while the map updates';
    case 'cooldown':
      return 'Refill and reset during cooldown';
    default:
      return 'Use the deck when the live flow needs it';
  }
}

export function CardsScreen() {
  const { state, submitCommand, submitCommands, refreshActiveMatch, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const deckViewModels = useMemo(
    () => buildDeckViewModels(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const [selectedDeckId, setSelectedDeckId] = useState<string | undefined>(deckViewModels[0]?.deck.deckId);
  const selectedDeck = deckViewModels.find((deck) => deck.deck.deckId === selectedDeckId) ?? deckViewModels[0];
  const [selectedCardInstanceId, setSelectedCardInstanceId] = useState<string | undefined>(
    pickDefaultCardInstanceId(selectedDeck)
  );
  const [selectedResponseCardIds, setSelectedResponseCardIds] = useState<string[]>([]);
  const [drawTrayCardIds, setDrawTrayCardIds] = useState<string[]>([]);
  const previousHandIdsRef = useRef<string[]>([]);
  const selectedCard = findResolvedVisibleCard(deckViewModels, selectedCardInstanceId);
  const activeCard = findResolvedVisibleCard(deckViewModels, projection?.activeCardResolution?.sourceCardInstanceId);
  const activeQuestion = findActiveQuestion(projection);
  const activeQuestionCategory = findQuestionCategory(defaultContentPack, activeQuestion?.categoryId);
  const responseSelectionLimit = activeQuestionCategory?.categoryId === 'tentacles' ? 2 : 1;
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );

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

  const handCardIds = useMemo(
    () => selectedDeck?.visibleByZone.hand.map((card) => card.card.cardInstanceId) ?? [],
    [selectedDeck]
  );
  const handCardDefinitions = useMemo(
    () => selectedDeck?.visibleByZone.hand.map((card) => card.definition) ?? [],
    [selectedDeck]
  );
  const handCardKindCounts = handCardDefinitions.reduce<Partial<Record<(typeof handCardDefinitions)[number]['kind'], number>>>(
    (counts, definition) => ({
      ...counts,
      [definition.kind]: (counts[definition.kind] ?? 0) + 1
    }),
    {}
  );
  const handSignature = handCardIds.join('|');

  useEffect(() => {
    const previousHandIds = previousHandIdsRef.current;
    previousHandIdsRef.current = handCardIds;
    const nextDrawTrayCardIds = reconcileDrawTrayCardIds({
      currentTrayCardIds: drawTrayCardIds,
      previousHandCardIds: previousHandIds,
      nextHandCardIds: handCardIds
    });

    if (!haveSameCardIdSequence(drawTrayCardIds, nextDrawTrayCardIds)) {
      setDrawTrayCardIds(nextDrawTrayCardIds);
    }
  }, [drawTrayCardIds, handCardIds, handSignature]);

  useEffect(() => {
    const nextSelectedResponseCardIds = filterCardIdsByVisibleHand(selectedResponseCardIds, handCardIds);

    if (!haveSameCardIdSequence(selectedResponseCardIds, nextSelectedResponseCardIds)) {
      setSelectedResponseCardIds(nextSelectedResponseCardIds);
    }
  }, [handCardIds, handSignature, selectedResponseCardIds]);

  const canPrepareFlow = Boolean(
    activeMatch &&
      viewerRole === 'host' &&
      projection &&
      ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(
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
  const cardsNeededToReachTarget = Math.max(0, HIDER_HAND_TARGET - handCardIds.length);
  const canDrawToTarget = canDraw && cardsNeededToReachTarget > 0;
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
  const drawTrayCards = selectedDeck?.visibleByZone.hand.filter((card) =>
    drawTrayCardIds.includes(card.card.cardInstanceId)
  ) ?? [];
  const selectedResponseCards = selectedDeck?.visibleByZone.hand.filter((card) =>
    selectedResponseCardIds.includes(card.card.cardInstanceId)
  ) ?? [];
  const selectedCardActionState = buildCardActionState({
    card: selectedCard,
    viewerRole,
    canPlay,
    canDiscard,
    lockReason
  });
  const activeCardBehavior = activeCard ? buildCardBehaviorModel(activeCard.definition) : undefined;
  const selectedCardWorkbookPlayability = selectedCard
    ? buildCardWorkbookPlayability({
        card: selectedCard.definition,
        projection,
        selectedScale,
        handCardCount: handCardDefinitions.length,
        handCardKindCounts
      })
    : undefined;
  const selectedCardResponseReason = selectedCard
    ? buildQuestionResponseCardReason(selectedCard.definition, activeQuestionCategory?.categoryId, selectedScale)
    : undefined;
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
  const canManageHiderDeck = Boolean(
    selectedDeck &&
      (viewerRole === 'host' || viewerRole === 'hider') &&
      selectedDeck.deck.ownerScope === 'hider_team'
  );

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
      title={liveGameplayState ? 'Hand & Effects' : 'Deck'}
      eyebrow={liveGameplayState ? 'Live Game' : 'Support'}
      subtitle={
        liveGameplayState
          ? 'Use this as the full deck review screen when the map flow needs more hand detail, card picks, or effect cleanup.'
          : 'Review visible hands and piles, understand what each card can really do, and manage card windows through the live match flow.'
      }
      topSlot={liveGameplayState ? undefined : <ProductNavBar current="cards" />}
      bottomSlot={liveGameplayState ? <GameplayTabBar current="deck" /> : undefined}
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
        title={liveGameplayState ? 'Hand Review' : 'Card Context'}
        subtitle={
          liveGameplayState
            ? 'The map now handles the fastest live actions. Use this screen for deeper hand review, longer card management, or full-resolution follow-through.'
            : 'Visibility, hand access, and card-lock rules for the current role.'
        }
      >
        <FactList
          items={[
            { label: 'Role', value: formatRoleLabel(viewerRole) },
            {
              label: 'Next Step',
              value: describeDeckFlowStep(projection?.lifecycleState, projection?.seekPhaseSubstate)
            },
            { label: 'Visible Decks', value: deckViewModels.length },
            { label: 'State Update', value: timingModel?.freshnessLabel ?? 'Waiting for live state' }
          ]}
        />
        <Text style={styles.copy}>
          Draw, play, discard, and resolution controls respect the real state machine. Manual and assisted cards never claim automated effects that the engine does not actually perform.
        </Text>
        {liveGameplayState ? (
          <AppButton
            label="Back To Live Map"
            tone="secondary"
            onPress={() => {
              router.push('/map');
            }}
          />
        ) : null}
        {liveGameplayState && canOpenMatchControls ? (
          <AppButton
            label="Open Match Controls"
            tone="ghost"
            onPress={() => {
              router.push('/status');
            }}
          />
        ) : null}
      </Panel>

      <Panel
        title="Hand Actions"
        subtitle="Refill, draw, or refresh the hider hand without leaving the live chase."
        tone="soft"
      >
        {canPrepareFlow ? (
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
            disabled={state.loadState === 'loading'}
          />
        ) : null}
        <AppButton
          label={
            canDrawToTarget
              ? `Draw ${cardsNeededToReachTarget} To Reach ${HIDER_HAND_TARGET}`
              : `Hand Target ${HIDER_HAND_TARGET} Ready`
          }
          onPress={() => {
            if (!selectedDeck || cardsNeededToReachTarget === 0) {
              return;
            }

            void submitCommands(
              Array.from({ length: cardsNeededToReachTarget }, () => ({
                type: 'draw_card' as const,
                payload: {
                  deckId: selectedDeck.deck.deckId
                }
              }))
            );
          }}
          disabled={!canDrawToTarget || state.loadState === 'loading'}
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
            subtitle="See what this deck is doing for the live chase, what is visible now, and whether anything is waiting for resolution."
            tone="accent"
          >
            <FactList
              items={[
                { label: 'Deck', value: selectedDeck.deck.name },
                { label: 'Ownership', value: formatDeckOwnerScope(selectedDeck.deck.ownerScope) },
                { label: 'Game Size', value: selectedScale ?? 'Waiting for setup' },
                { label: 'Visible Cards', value: selectedDeck.visibleCards.length },
                { label: 'Pending Windows', value: selectedDeck.visibleByZone.pending_resolution.length }
              ]}
            />
            <Text style={styles.copy}>{selectedDeckVisibility}</Text>
          </Panel>

          {canManageHiderDeck ? (
            <Panel
              title="Keep The Hider Hand Ready"
              subtitle="Stay at six cards, track fresh draws, and keep likely response cards ready for the current clue."
            >
              <FactList
                items={[
                  { label: 'Hand Target', value: `${HIDER_HAND_TARGET} cards` },
                  { label: 'Current Hand', value: handCardIds.length },
                  {
                    label: 'Need To Draw',
                    value: cardsNeededToReachTarget > 0 ? `${cardsNeededToReachTarget} more` : 'Hand is ready'
                  },
                  {
                    label: 'Active Clue',
                    value: activeQuestionCategory?.name ?? 'No live question right now'
                  },
                  {
                    label: 'Response Picks',
                    value: `${selectedResponseCards.length} of ${responseSelectionLimit}`
                  }
                ]}
              />
              <Text style={styles.copy}>
                Freshly drawn cards appear in a temporary tray here so the hider team can decide what to keep, what to discard, and what to hold back as a response card.
              </Text>
              {selectedCardResponseReason ? (
                <Text style={styles.copy}>{selectedCardResponseReason}</Text>
              ) : null}
              {selectedCard?.card.zone === 'hand' ? (
                <AppButton
                  label={
                    selectedResponseCardIds.includes(selectedCard.card.cardInstanceId)
                      ? 'Remove Selected From Response Picks'
                      : `Add Selected To Response Picks (${responseSelectionLimit} max)`
                  }
                  onPress={() => {
                    setSelectedResponseCardIds((current) => {
                      const cardId = selectedCard.card.cardInstanceId;
                      if (current.includes(cardId)) {
                        return current.filter((candidate) => candidate !== cardId);
                      }

                      return [...current, cardId].slice(-responseSelectionLimit);
                    });
                  }}
                  tone="secondary"
                  disabled={state.loadState === 'loading'}
                />
              ) : null}
              {selectedCard?.card.zone === 'hand' && drawTrayCardIds.includes(selectedCard.card.cardInstanceId) ? (
                <AppButton
                  label="Mark Selected Card As Keep"
                  onPress={() => {
                    setDrawTrayCardIds((current) =>
                      current.filter((candidate) => candidate !== selectedCard.card.cardInstanceId)
                    );
                  }}
                  tone="secondary"
                  disabled={state.loadState === 'loading'}
                />
              ) : null}
            </Panel>
          ) : null}

          <Panel
            title="Current Hand"
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
            title="Fresh Draws"
            subtitle="Newly drawn hand cards stay here until you mark them as keeps or spend/discard them."
          >
            <CardZoneSection
              title="Temporary Draw Tray"
              cards={drawTrayCards}
              emptyText="No freshly drawn hand cards are waiting for review."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Response Picks"
            subtitle={
              activeQuestionCategory
                ? `Cards the hider team wants ready for ${activeQuestionCategory.name}.`
                : 'Cards the hider team wants to keep ready for the next question.'
            }
          >
            <CardZoneSection
              title="Selected Response Cards"
              cards={selectedResponseCards}
              emptyText="No response cards are marked yet."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Active Effects"
            subtitle="Cards currently locked in a resolution window or waiting for a manual effect to finish."
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
        subtitle="Review the selected card, understand what it really does, and then return to the live map when you are ready."
        tone="soft"
      >
        <CardDetailPanel
          card={selectedCard}
          viewerRole={viewerRole}
          selectedScale={selectedScale}
          workbookPlayability={selectedCardWorkbookPlayability}
          responseReason={selectedCardResponseReason}
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
        subtitle="Finish manual or assisted card windows here so the live chase can continue cleanly."
      >
        <CardResolutionStatusPanel
          activeCard={activeCard}
          resolution={projection?.activeCardResolution}
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
