import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

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
  useMatchTimingModel
} from '../features/timers/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
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
          ? 'Private hand review, response picks, and card windows.'
          : 'Review visible hands, piles, and live effects.'
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
        <View style={styles.heroCard}>
          <View style={styles.heroHeader}>
            <View style={styles.heroText}>
              <Text style={styles.heroEyebrow}>Deck control</Text>
              <Text style={styles.heroTitle}>
                {selectedDeck?.deck.name ?? 'Choose a deck'}
              </Text>
              <Text style={styles.heroCopy}>
                {describeDeckFlowStep(projection?.lifecycleState, projection?.seekPhaseSubstate)}
              </Text>
            </View>
            <View style={styles.heroMeta}>
              <Text style={styles.heroMetaValue}>{formatRoleLabel(viewerRole)}</Text>
              <Text style={styles.heroMetaLabel}>Role</Text>
            </View>
          </View>

          <View style={styles.chipRow}>
            <View style={styles.infoChip}>
              <Text style={styles.infoValue}>{deckViewModels.length}</Text>
              <Text style={styles.infoLabel}>Visible decks</Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoValue}>{handCardIds.length} / {HIDER_HAND_TARGET}</Text>
              <Text style={styles.infoLabel}>Hand</Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoValue}>{selectedResponseCards.length} / {responseSelectionLimit}</Text>
              <Text style={styles.infoLabel}>Response picks</Text>
            </View>
            <View style={styles.infoChip}>
              <Text style={styles.infoValue}>{timingModel?.freshnessLabel ?? 'Waiting'}</Text>
              <Text style={styles.infoLabel}>State</Text>
            </View>
          </View>

          <View style={styles.heroActions}>
            {liveGameplayState ? (
              <View style={styles.actionCell}>
                <AppButton
                  label="Back To Live Map"
                  tone="secondary"
                  onPress={() => {
                    router.push('/map');
                  }}
                />
              </View>
            ) : null}
            {liveGameplayState && canOpenMatchControls ? (
              <View style={styles.actionCell}>
                <AppButton
                  label="Match Controls"
                  tone="ghost"
                  onPress={() => {
                    router.push('/status');
                  }}
                />
              </View>
            ) : null}
            {canPrepareFlow ? (
              <View style={styles.actionCell}>
                <AppButton
                  label={state.loadState === 'loading' ? 'Working...' : 'Prepare Card Play'}
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
              </View>
            ) : null}
            <View style={styles.actionCell}>
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
            </View>
            <View style={styles.actionCell}>
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
            </View>
            <View style={styles.actionCell}>
              <AppButton
                label="Refresh Card State"
                onPress={() => {
                  void refreshActiveMatch();
                }}
                tone="secondary"
                disabled={!activeMatch || state.loadState === 'loading'}
              />
            </View>
          </View>
        </View>
      ) : null}

      {deckViewModels.length === 0 ? (
        <StateBanner
          tone="info"
          title="No visible decks"
          detail="This role and scope do not expose any deck contents right now."
        />
      ) : null}

      {selectedDeck ? (
        <>
          <Panel
            title="Decks"
            subtitle="Choose the hand you want to inspect."
            tone="accent"
          >
            <CardDeckList
              decks={deckViewModels}
              selectedDeckId={selectedDeck?.deck.deckId}
              viewerRole={viewerRole}
              onSelect={setSelectedDeckId}
            />
            <View style={styles.deckSummary}>
              <Text style={styles.deckSummaryTitle}>{selectedDeck.deck.name}</Text>
              <Text style={styles.deckSummaryMeta}>
                {formatDeckOwnerScope(selectedDeck.deck.ownerScope)} · {selectedScale ?? 'Waiting for setup'}
              </Text>
              <Text style={styles.copy}>{selectedDeckVisibility}</Text>
            </View>
          </Panel>

          <Panel
            title="Live Hand"
            subtitle="Main hand, fresh draws, response picks, and active effects."
          >
            {canManageHiderDeck ? (
              <View style={styles.handSummary}>
                <View style={styles.chipRow}>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>{handCardIds.length} / {HIDER_HAND_TARGET}</Text>
                    <Text style={styles.infoLabel}>Hand target</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>
                      {cardsNeededToReachTarget > 0 ? `${cardsNeededToReachTarget} more` : 'Ready'}
                    </Text>
                    <Text style={styles.infoLabel}>Need to draw</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>{activeQuestionCategory?.name ?? 'No live clue'}</Text>
                    <Text style={styles.infoLabel}>Active clue</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>{selectedResponseCards.length} / {responseSelectionLimit}</Text>
                    <Text style={styles.infoLabel}>Response picks</Text>
                  </View>
                </View>
                {selectedCardResponseReason ? (
                  <Text style={styles.copy}>{selectedCardResponseReason}</Text>
                ) : null}
                <View style={styles.heroActions}>
                  {selectedCard?.card.zone === 'hand' ? (
                    <View style={styles.actionCell}>
                      <AppButton
                        label={
                          selectedResponseCardIds.includes(selectedCard.card.cardInstanceId)
                            ? 'Remove From Picks'
                            : `Add To Picks (${responseSelectionLimit} max)`
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
                    </View>
                  ) : null}
                  {selectedCard?.card.zone === 'hand' && drawTrayCardIds.includes(selectedCard.card.cardInstanceId) ? (
                    <View style={styles.actionCell}>
                      <AppButton
                        label="Mark As Keep"
                        onPress={() => {
                          setDrawTrayCardIds((current) =>
                            current.filter((candidate) => candidate !== selectedCard.card.cardInstanceId)
                          );
                        }}
                        tone="secondary"
                        disabled={state.loadState === 'loading'}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            ) : null}

            <CardZoneSection
              title="Current Hand"
              cards={selectedDeck.visibleByZone.hand}
              emptyText="No visible hand cards in the current scope."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
            <CardZoneSection
              title="Temporary Draw Tray"
              cards={drawTrayCards}
              emptyText="No freshly drawn hand cards are waiting for review."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
            <CardZoneSection
              title="Selected Response Cards"
              cards={selectedResponseCards}
              emptyText="No response cards are marked yet."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
            <CardZoneSection
              title="Cards Awaiting Resolution"
              cards={selectedDeck.visibleByZone.pending_resolution}
              emptyText="No pending-resolution cards are visible in this deck right now."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
          </Panel>

          <Panel
            title="Piles"
            subtitle="Draw pile, discards, and removed cards."
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
            <CardZoneSection
              title="Visible Discards"
              cards={selectedDeck.visibleByZone.discard_pile}
              emptyText="No visible discarded cards for this deck yet."
              selectedCardInstanceId={selectedCard?.card.cardInstanceId}
              onSelect={setSelectedCardInstanceId}
            />
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
        title="Selected Card"
        subtitle="Workbook detail and current actions."
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
        title="Card Window"
        subtitle="Resolve the current effect when the state allows it."
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
          subtitle="Add photo proof when the effect needs it."
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
  heroCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 28,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 2
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  heroText: {
    flex: 1,
    gap: 4
  },
  heroEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  heroCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  heroMeta: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 2,
    minWidth: 78,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  heroMetaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  heroMetaLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  infoChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 16
  },
  infoLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  heroActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionCell: {
    flexBasis: '48%',
    flexGrow: 1
  },
  deckSummary: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 6,
    padding: 14
  },
  deckSummaryTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  deckSummaryMeta: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  handSummary: {
    gap: 10
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
