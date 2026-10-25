import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildCardActionState,
  buildCardWorkbookPlayability,
  buildCardBehaviorModel,
  CardDeckList,
  CardDetailPanel,
  CardResolutionStatusPanel,
  EggPartnerChallengePanel,
  JammedDoorChallengePanel,
  LuxuryCarChallengePanel,
  UTurnChallengePanel,
  RansomNoteChallengePanel,
  CairnChallengePanel,
  CardZoneSection,
  buildQuestionResponseCardReason,
  buildCardFlowBootstrapCommands,
  buildDeckViewModels,
  canDiscardCards,
  canDrawCards,
  canPlayCards,
  canResolveCardWindow,
  getCardResolutionBlockedReason,
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
import { colors, fonts } from '../ui/theme.ts';

function describeDeckFlowStep(
  lifecycleState: string | undefined,
  seekPhaseSubstate: string | undefined
) {
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
    return lifecycleState
      .replace(/_/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());
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
  const {
    state,
    submitCommand,
    submitCommands,
    refreshActiveMatch,
    prepareAttachmentUploadCommands,
    getContentPackByReference
  } = useAppShell();
  const [showPiles, setShowPiles] = useState(false);
  const [touristNoInternetConfirmed, setTouristNoInternetConfirmed] = useState(false);
  const [challengeClockNow, setChallengeClockNow] = useState(Date.now());
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  useEffect(() => {
    if (!projection?.mediocreTravelAgentChallenge) return;
    const timer = setInterval(() => setChallengeClockNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [projection?.mediocreTravelAgentChallenge?.sourceCardInstanceId]);
  const contentPack = getContentPackByReference(projection?.contentPackId, projection?.contentPackVersion);
  const hiderHandLimit = projection?.hiderHandLimit ?? HIDER_HAND_TARGET;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(
    activeMatch?.playerRole,
    activeMatch?.recipient.scope
  );
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const deckViewModels = useMemo(
    () => buildDeckViewModels(contentPack, projection, viewerRole),
    [contentPack, projection, viewerRole]
  );
  const [selectedDeckId, setSelectedDeckId] = useState<string | undefined>(
    deckViewModels[0]?.deck.deckId
  );
  const selectedDeck =
    deckViewModels.find((deck) => deck.deck.deckId === selectedDeckId) ??
    deckViewModels[0];
  const [selectedCardInstanceId, setSelectedCardInstanceId] = useState<
    string | undefined
  >(pickDefaultCardInstanceId(selectedDeck));
  const [selectedResponseCardIds, setSelectedResponseCardIds] = useState<
    string[]
  >([]);
  const [selectedRewardCardIdsBySet, setSelectedRewardCardIdsBySet] = useState<string[][]>([]);
  const [useQuestionRewardDrawBonus, setUseQuestionRewardDrawBonus] = useState(false);
  const [drawTrayCardIds, setDrawTrayCardIds] = useState<string[]>([]);
  useEffect(() => setTouristNoInternetConfirmed(false), [projection?.unguidedTouristChallenge?.sourceCardInstanceId, projection?.unguidedTouristChallenge?.candidate?.attachmentId]);
  const previousHandIdsRef = useRef<string[]>([]);
  const selectedCard = findResolvedVisibleCard(
    deckViewModels,
    selectedCardInstanceId
  );
  const activeCard = findResolvedVisibleCard(
    deckViewModels,
    projection?.activeCardResolution?.sourceCardInstanceId
  );
  const copiedCard = findResolvedVisibleCard(
    deckViewModels,
    projection?.activeCardResolution?.copiedCardInstanceId
  );
  const activeQuestion = findActiveQuestion(projection);
  const pendingQuestionReward = projection?.pendingQuestionReward;
  const latestResolvedQuestion = [...(projection?.visibleQuestions ?? [])]
    .reverse()
    .find((question) => question.status === 'resolved');
  const latestVisibleQuestion = projection?.visibleQuestions.at(-1);
  const latestLateResolvedQuestion = latestVisibleQuestion?.status === 'resolved' && latestVisibleQuestion.lateResponseStartedAt
    ? latestVisibleQuestion
    : undefined;
  const activeQuestionCategory = findQuestionCategory(
    contentPack,
    activeQuestion?.categoryId
  );
  const responseSelectionLimit =
    activeQuestionCategory?.categoryId === 'tentacles' ? 2 : 1;
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
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
    const availableCardIds = new Set(
      selectedDeck?.visibleCards.map((card) => card.card.cardInstanceId) ?? []
    );
    if (
      !selectedCardInstanceId ||
      !availableCardIds.has(selectedCardInstanceId)
    ) {
      setSelectedCardInstanceId(pickDefaultCardInstanceId(selectedDeck));
    }
  }, [selectedCardInstanceId, selectedDeck]);

  useEffect(() => {
    setSelectedRewardCardIdsBySet((current) => {
      const sets = pendingQuestionReward?.sets ?? [];
      return sets.map((set, index) =>
        (current[index] ?? []).filter((cardId) => set.cardInstanceIds.includes(cardId))
      );
    });
  }, [pendingQuestionReward?.questionInstanceId, pendingQuestionReward?.sets]);

  useEffect(() => {
    setUseQuestionRewardDrawBonus(false);
  }, [latestResolvedQuestion?.questionInstanceId]);

  const handCardIds = useMemo(
    () =>
      selectedDeck?.visibleByZone.hand.map(
        (card) => card.card.cardInstanceId
      ) ?? [],
    [selectedDeck]
  );
  const handCardDefinitions = useMemo(
    () => selectedDeck?.visibleByZone.hand.map((card) => card.definition) ?? [],
    [selectedDeck]
  );
  const selectedCardIsDuplicate = Boolean(
    selectedCard?.card.zone === 'hand' &&
    selectedCard.definition.effects.some((effect) => effect.effectType === 'duplicate_card')
  );
  const duplicateTargets = selectedDeck?.visibleByZone.hand.filter((card) =>
    card.card.cardInstanceId !== selectedCard?.card.cardInstanceId &&
    card.definition.kind !== 'time_bonus' &&
    !card.definition.effects.some((effect) => effect.effectType === 'duplicate_card')
  ) ?? [];
  const handCardKindCounts = handCardDefinitions.reduce<
    Partial<Record<(typeof handCardDefinitions)[number]['kind'], number>>
  >(
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
    const nextSelectedResponseCardIds = filterCardIdsByVisibleHand(
      selectedResponseCardIds,
      handCardIds
    );

    if (
      !haveSameCardIdSequence(
        selectedResponseCardIds,
        nextSelectedResponseCardIds
      )
    ) {
      setSelectedResponseCardIds(nextSelectedResponseCardIds);
    }
  }, [handCardIds, handSignature, selectedResponseCardIds]);

  const canPrepareFlow = Boolean(
    activeMatch &&
      viewerRole === 'host' &&
      projection &&
      [
        'draft',
        'lobby',
        'role_assignment',
        'rules_confirmation',
        'map_setup'
      ].includes(projection.lifecycleState)
  );
  const lockReason =
    projection?.activeCardResolution?.sourceCardInstanceId &&
    selectedCard &&
    projection.activeCardResolution.sourceCardInstanceId !==
      selectedCard.card.cardInstanceId
      ? 'Another card window is already active. Only the pending-resolution card can be closed right now.'
      : undefined;
  const canDraw = Boolean(
    activeMatch &&
      selectedDeck &&
      canDrawCards(projection) &&
      viewerRole !== 'spectator'
  );
  const cardsNeededToReachTarget = Math.max(
    0,
    hiderHandLimit - handCardIds.length
  );
  const canDrawToTarget = canDraw && cardsNeededToReachTarget > 0;
  const canPlay = Boolean(
    activeMatch &&
      selectedCard &&
      selectedCard.card.zone === 'hand' &&
      selectedCard.definition.kind !== 'time_bonus' &&
      !selectedCardIsDuplicate &&
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
    activeMatch && canResolveCardWindow(viewerRole, projection)
  );
  const selectedDeckVisibility = selectedDeck
    ? describeDeckVisibility(selectedDeck.deck, viewerRole)
    : 'Select a deck to review its visible hand and piles.';
  const drawTrayCards =
    selectedDeck?.visibleByZone.hand.filter((card) =>
      drawTrayCardIds.includes(card.card.cardInstanceId)
    ) ?? [];
  const selectedResponseCards =
    selectedDeck?.visibleByZone.hand.filter((card) =>
      selectedResponseCardIds.includes(card.card.cardInstanceId)
    ) ?? [];
  const selectedCardActionState = buildCardActionState({
    card: selectedCard,
    viewerRole,
    canPlay,
    canDiscard,
    lockReason
  });
  const activeCardBehavior = activeCard
    ? buildCardBehaviorModel(activeCard.definition)
    : undefined;
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
    ? buildQuestionResponseCardReason(
        selectedCard.definition,
        activeQuestionCategory?.categoryId,
        selectedScale
      )
    : undefined;
  const evidenceContexts = useMemo(
    () => buildEvidenceContexts(contentPack, projection, viewerRole),
    [contentPack, projection, viewerRole]
  );
  const activeCardEvidenceContext = evidenceContexts.find(
    (context) => context.kind === 'card'
  );
  const cardAttachmentContext = useMemo<
    LocalEvidenceContextDescriptor | undefined
  >(
    () =>
      activeCardEvidenceContext
        ? {
            contextId: activeCardEvidenceContext.contextId,
            kind: 'card',
            title: activeCardEvidenceContext.title,
            detail: activeCardEvidenceContext.detail,
            visibilityScope: activeCardEvidenceContext.suggestedVisibilityScope,
            teamId: activeCardEvidenceContext.teamId,
            attachmentKind: activeCardEvidenceContext.attachmentKind,
            cardInstanceId: activeCardEvidenceContext.cardInstanceId
          }
        : undefined,
    [activeCardEvidenceContext]
  );
  const cardEvidenceDrafts = cardAttachmentContext
    ? localMedia.getContextDrafts(cardAttachmentContext.contextId)
    : [];
  const zoologistHiderAttachmentId = projection?.activeCardResolution?.sourceCardInstanceId
    ? projection.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === projection.activeCardResolution?.sourceCardInstanceId &&
        attachment.ownerPlayerId === activeMatch?.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      ).at(-1)?.attachmentId
    : undefined;
  const luxuryCarHiderAttachmentId = projection?.activeCardResolution?.sourceCardInstanceId
    ? projection.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === projection.activeCardResolution?.sourceCardInstanceId &&
        attachment.ownerPlayerId === activeMatch?.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      ).at(-1)?.attachmentId
    : undefined;
  const labyrinthHiderAttachmentId = projection?.activeCardResolution?.sourceCardInstanceId
    ? projection.visibleAttachments.find((attachment) =>
        attachment.attachmentId === projection.activeCardResolution?.labyrinth?.mazeAttachmentId &&
        attachment.ownerPlayerId === activeMatch?.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      )?.attachmentId ?? projection.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === projection.activeCardResolution?.sourceCardInstanceId &&
        attachment.ownerPlayerId === activeMatch?.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      ).at(-1)?.attachmentId
    : undefined;
  const zoologistSeekerAttachmentId = projection?.zoologistChallenge && activeMatch?.recipient.playerId
    ? projection.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === projection.zoologistChallenge?.sourceCardInstanceId &&
        attachment.ownerPlayerId === activeMatch.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      ).at(-1)?.attachmentId
    : undefined;
  const luxuryCarSeekerAttachmentId = projection?.luxuryCarChallenge && activeMatch?.recipient.playerId
    ? projection.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === projection.luxuryCarChallenge?.sourceCardInstanceId &&
        attachment.ownerPlayerId === activeMatch.recipient.playerId &&
        attachment.visibilityScope === 'public_match' &&
        attachment.kind === 'photo_evidence'
      ).at(-1)?.attachmentId
    : undefined;
  const touristCardInstanceId = projection?.activeCardResolution?.resolutionKind === 'unguided_tourist_challenge'
    ? projection.activeCardResolution.sourceCardInstanceId
    : projection?.unguidedTouristChallenge?.sourceCardInstanceId;
  const touristOwnedPhotos = touristCardInstanceId && activeMatch?.recipient.playerId
    ? projection?.visibleAttachments.filter((attachment) =>
        attachment.linkedCardInstanceId === touristCardInstanceId &&
        attachment.ownerPlayerId === activeMatch.recipient.playerId &&
        attachment.visibilityScope === 'public_match' && attachment.kind === 'photo_evidence'
      ) ?? []
    : [];
  const touristOwnPhotoId = touristOwnedPhotos.at(-1)?.attachmentId;
  const touristHiderAttachmentId = projection?.activeCardResolution?.resolutionKind === 'unguided_tourist_challenge'
    ? touristOwnedPhotos.at(-1)?.attachmentId
    : undefined;
  const birdGuideCardInstanceId = projection?.activeCardResolution?.resolutionKind === 'bird_guide_challenge'
    ? projection.activeCardResolution.sourceCardInstanceId
    : projection?.birdGuideChallenge?.sourceCardInstanceId;
  const birdGuideVideos = birdGuideCardInstanceId && activeMatch?.recipient.playerId
    ? projection?.visibleAttachments.filter((attachment) => attachment.linkedCardInstanceId === birdGuideCardInstanceId &&
        attachment.ownerPlayerId === activeMatch.recipient.playerId && attachment.kind === 'video_evidence' &&
        attachment.visibilityScope === 'public_match') ?? []
    : [];
  const birdGuideHiderAttachmentId = projection?.activeCardResolution?.resolutionKind === 'bird_guide_challenge'
    ? birdGuideVideos.at(-1)?.attachmentId
    : undefined;
  const birdGuideSeekerAttachmentId = projection?.birdGuideChallenge
    ? birdGuideVideos.at(-1)?.attachmentId
    : undefined;
  const birdGuideMaximumDurationMinutes = projection?.activeCardResolution?.resolutionKind === 'bird_guide_challenge'
    ? projection.activeCardResolution.birdGuideMaximumDurationMinutes ?? 5
    : projection?.birdGuideChallenge
      ? Math.floor(projection.birdGuideChallenge.maximumDurationMs / 60_000)
      : undefined;
  const resolveDisabledReason =
    activeCard && !canResolve
      ? getCardResolutionBlockedReason(viewerRole, projection) ?? 'The hider holding this card or a host-admin must close the active card window after the effect is handled.'
      : undefined;
  const cardEvidenceHint =
    activeMatch?.onlineStatus?.attachmentStorageMode ===
    'durable_supabase_storage'
      ? 'Recording evidence here uploads the image to Supabase Storage and records durable attachment metadata in the match.'
      : activeMatch?.runtimeKind === 'online_foundation'
        ? 'Recording evidence here still creates real attachment records, but this online session is not yet writing shared media binaries.'
        : 'Recording media here creates attachment metadata in the match. Binary storage and later review workflows are still partial, so this screen stays explicit about what is and is not persisted.';
  const canManageHiderDeck = Boolean(
    selectedDeck &&
      (viewerRole === 'host' || viewerRole === 'hider') &&
      selectedDeck.deck.ownerScope === 'hider_team'
  );
  const rewardSelectionValid = Boolean(
    pendingQuestionReward &&
    pendingQuestionReward.sets.every((set, index) =>
      (selectedRewardCardIdsBySet[index]?.length ?? 0) === set.pickCount
    )
  );
  const rewardWouldExceedHand = Boolean(
    pendingQuestionReward &&
    handCardIds.length + pendingQuestionReward.sets.reduce((count, set) => count + set.pickCount, 0) > hiderHandLimit
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
      title="Your bag of tricks"
      eyebrow={liveGameplayState ? 'PLAY YOUR NEXT MOVE' : 'THE CARD KIT'}
      subtitle={
        liveGameplayState
          ? 'Collect useful cards. Pick your moment. Change the chase.'
          : 'Review visible hands, piles, and live effects.'
      }
      topSlot={
        liveGameplayState ? undefined : <ProductNavBar current="cards" />
      }
      bottomSlot={
        liveGameplayState ? <GameplayTabBar current="deck" /> : undefined
      }
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

      {projection?.unguidedTouristChallenge ? (
        <Panel title="Curse of the Unguided Tourist" subtitle="Find the pictured structure in person. No internet research or transportation." tone="accent">
          <Text style={styles.copy}>Street View clue: {projection.visibleAttachments.find((attachment) => attachment.attachmentId === projection.unguidedTouristChallenge?.hiderAttachmentId)?.label ?? 'shared by the hider'}.</Text>
          {projection.unguidedTouristChallenge.candidate ? (
            <>
              <Text style={styles.copy}>Found-location photo from {projection.players.find((player) => player.playerId === projection.unguidedTouristChallenge?.candidate?.submittedByPlayerId)?.displayName ?? 'a seeker'}: {projection.visibleAttachments.find((attachment) => attachment.attachmentId === projection.unguidedTouristChallenge?.candidate?.attachmentId)?.label ?? 'photo submitted'}. The seeker attests they did not use internet research.</Text>
              {(viewerRole === 'hider' || viewerRole === 'host') ? (
                <View style={styles.buttonRow}>
                  <AppButton label="Needs another try" tone="secondary" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'review_unguided_tourist_photo', payload: { sourceCardInstanceId: projection.unguidedTouristChallenge!.sourceCardInstanceId, approved: false } })} />
                  <AppButton label="Found it" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'review_unguided_tourist_photo', payload: { sourceCardInstanceId: projection.unguidedTouristChallenge!.sourceCardInstanceId, approved: true } })} />
                </View>
              ) : null}
            </>
          ) : (
            <Text style={styles.copy}>Seekers: find the actual structure together, take a new camera photo, and submit it here for the hider to check.</Text>
          )}
          {viewerRole === 'seeker' && !projection.unguidedTouristChallenge.candidate ? (
            <>
              <Text style={styles.copy}>{touristOwnPhotoId ? 'Your public camera photo is ready to submit.' : 'Take a photo in the Card Evidence section below.'}</Text>
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: touristNoInternetConfirmed }} onPress={() => setTouristNoInternetConfirmed((value) => !value)} style={styles.checkboxRow}>
                <View style={[styles.checkbox, touristNoInternetConfirmed ? styles.checkboxChecked : undefined]}><Text style={styles.checkboxMark}>{touristNoInternetConfirmed ? '✓' : ''}</Text></View>
                <Text style={styles.copy}>We found this without internet research.</Text>
              </Pressable>
              <AppButton label="Send found photo to hider" disabled={state.loadState === 'loading' || !touristOwnPhotoId || !touristNoInternetConfirmed} onPress={() => touristOwnPhotoId && void submitCommand({ type: 'submit_unguided_tourist_photo', payload: { sourceCardInstanceId: projection.unguidedTouristChallenge!.sourceCardInstanceId, attachmentId: touristOwnPhotoId, attestedNoInternetResearch: true } })} />
            </>
          ) : null}
        </Panel>
      ) : null}

      {projection?.birdGuideChallenge ? (
        <Panel title="Curse of the Bird Guide" subtitle="Match the hider’s bird recording." tone="accent">
          <Text style={styles.copy}>Hider’s one-take target: {Math.ceil(projection.birdGuideChallenge.hiderDurationMs / 1000)} seconds. Scale cap: {Math.floor(projection.birdGuideChallenge.maximumDurationMs / 60_000)} minutes. The hider must confirm that a recognizable part of the bird was already in frame at the start.</Text>
          {projection.birdGuideChallenge.candidate ? (
            <>
              <Text style={styles.copy}>A seeker submitted a {Math.ceil(projection.birdGuideChallenge.candidate.durationMs / 1000)} second video. The hider checks that it shows a bird and lasts at least as long as the reference.</Text>
              {(viewerRole === 'hider' || viewerRole === 'host') ? (
                <View style={styles.buttonRow}>
                  <AppButton label="Needs another try" tone="secondary" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'review_bird_guide_video', payload: { sourceCardInstanceId: projection.birdGuideChallenge!.sourceCardInstanceId, approved: false } })} />
                  <AppButton label="Approve video" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'review_bird_guide_video', payload: { sourceCardInstanceId: projection.birdGuideChallenge!.sourceCardInstanceId, approved: true } })} />
                </View>
              ) : null}
            </>
          ) : viewerRole === 'seeker' ? (
            <>
              <Text style={styles.copy}>{birdGuideSeekerAttachmentId ? 'Your camera video is ready to send.' : 'Record a bird video that lasts at least as long as the hider’s.'}</Text>
              <AppButton label="Send bird video to hider" disabled={state.loadState === 'loading' || !birdGuideSeekerAttachmentId} onPress={() => birdGuideSeekerAttachmentId && void submitCommand({ type: 'submit_bird_guide_video', payload: { sourceCardInstanceId: projection.birdGuideChallenge!.sourceCardInstanceId, attachmentId: birdGuideSeekerAttachmentId } })} />
            </>
          ) : <Text style={styles.copy}>Waiting for the seekers to submit a matching bird video.</Text>}
          <Text style={styles.copy}>Players verify bird identity and continuous framing by watching the videos. The app checks recorded duration and the hider’s frame-start attestation; it cannot inspect the video content.</Text>
        </Panel>
      ) : null}

      {projection?.mediocreTravelAgentChallenge ? (() => {
        const challenge = projection.mediocreTravelAgentChallenge;
        const travelPhotos = projection.visibleAttachments.filter((attachment) =>
          attachment.linkedCardInstanceId === challenge.sourceCardInstanceId &&
          attachment.kind === 'photo_evidence' && attachment.visibilityScope === 'public_match'
        );
        const elapsedMinutesByPlayer = challenge.requiredSeekerPlayerIds.map((playerId) => {
          const startedAt = challenge.stayStartedAtByPlayerId[playerId];
          return startedAt ? Math.floor((challengeClockNow - Date.parse(startedAt)) / 60_000) : undefined;
        });
        const visitComplete = elapsedMinutesByPlayer.length > 0 && elapsedMinutesByPlayer.every((minutes) => minutes !== undefined && minutes >= challenge.stayMinutes);
        const souvenirAcquired = Boolean(challenge.souvenirAcquiredAt);
        const souvenirLost = Boolean(challenge.souvenirLostAt);
        return (
          <Panel title="Curse of the Mediocre Travel Agent" subtitle={`${challenge.destinationName} · ${Math.round(challenge.maximumDistanceMeters)} m radius`} tone="accent">
            <Text style={styles.copy}>Visit the public destination and stay within {challenge.arrivalRadiusMeters} m for {challenge.stayMinutes} minutes. Everyone must submit at least {challenge.requiredPhotoCount} new camera photos. The hider must receive a souvenir; losing it before being caught adds {challenge.hiderBonusMinutes} minutes to the hider’s final score.</Text>
            {challenge.requiredSeekerPlayerIds.map((playerId, index) => {
              const player = projection.players.find((item) => item.playerId === playerId);
              const minutes = elapsedMinutesByPlayer[index];
              const transitStatus = challenge.transitStatusByPlayerId[playerId];
              return <Text key={playerId} style={styles.copy}>{player?.displayName ?? 'Seeker'}: {transitStatus ? transitStatus.onTransitOrAtStation ? 'on transit / station' : 'off transit confirmed' : 'transit check needed'} · {minutes === undefined ? 'not currently checked in at the destination' : `${Math.min(minutes, challenge.stayMinutes)} / ${challenge.stayMinutes} minutes checked in`}</Text>;
            })}
            {viewerRole === 'seeker' && activeMatch?.recipient.playerId ? <AppButton label={challenge.transitStatusByPlayerId[activeMatch.recipient.playerId]?.onTransitOrAtStation === false ? 'Report transit / station' : 'Confirm I am off transit'} tone="secondary" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'set_seeker_transit_context', payload: { sourceCardInstanceId: challenge.sourceCardInstanceId, onTransitOrAtStation: challenge.transitStatusByPlayerId[activeMatch.recipient.playerId!]?.onTransitOrAtStation === false } })} /> : null}
            <Text style={styles.copy}>Public photos: {travelPhotos.length} / {challenge.requiredPhotoCount}</Text>
            <Text style={styles.copy}>Souvenir: {souvenirLost ? 'reported lost' : souvenirAcquired ? 'acquired and must be kept until you are caught' : 'not acquired yet'}</Text>
            {viewerRole === 'seeker' && !souvenirAcquired ? <AppButton label="We got the souvenir" tone="secondary" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'report_mediocre_travel_souvenir', payload: { sourceCardInstanceId: challenge.sourceCardInstanceId, status: 'acquired' } })} /> : null}
            {viewerRole === 'seeker' && souvenirAcquired && !souvenirLost ? <AppButton label="Souvenir lost" tone="secondary" disabled={state.loadState === 'loading'} onPress={() => void submitCommand({ type: 'report_mediocre_travel_souvenir', payload: { sourceCardInstanceId: challenge.sourceCardInstanceId, status: 'lost' } })} /> : null}
            {!challenge.completedAt && (viewerRole === 'seeker' || viewerRole === 'host') ? <AppButton label="Finish the vacation" disabled={state.loadState === 'loading' || !visitComplete || travelPhotos.length < challenge.requiredPhotoCount || !souvenirAcquired} onPress={() => void submitCommand({ type: 'complete_mediocre_travel_agent', payload: { sourceCardInstanceId: challenge.sourceCardInstanceId } })} /> : null}
            {challenge.completedAt ? <Text style={styles.copy}>Challenge complete. Keep the physical souvenir with the seekers until the hider catches them.</Text> : null}
            {challenge.bonusAwardedAt ? <Text style={styles.copy}>Hider score bonus awarded: +{challenge.hiderBonusMinutes} minutes.</Text> : null}
          </Panel>
        );
      })() : null}

      {projection?.eggPartnerChallenge ? (
        <Panel title="Curse of the Egg Partner" subtitle="Track the egg and its effect on the seeker team." tone="accent">
          <EggPartnerChallengePanel
            challenge={projection.eggPartnerChallenge}
            players={projection.players.filter((player) => player.role === 'seeker').map((player) => ({ playerId: player.playerId, displayName: player.displayName }))}
            viewerRole={viewerRole}
            viewerPlayerId={activeMatch?.recipient.playerId}
            disabled={state.loadState === 'loading'}
            onAcquire={() => void submitCommand({ type: 'confirm_egg_partner_acquired', payload: { sourceCardInstanceId: projection.eggPartnerChallenge!.sourceCardInstanceId } })}
            onReportLost={(memberId, lossKind) => void submitCommand({ type: 'report_egg_partner_member_lost', payload: { sourceCardInstanceId: projection.eggPartnerChallenge!.sourceCardInstanceId, memberId, lossKind } })}
          />
        </Panel>
      ) : null}

      {projection?.jammedDoorChallenge ? (
        <Panel title="Curse of the Jammed Door" subtitle="Track visible doorway rolls and shared retry times." tone="accent">
          <JammedDoorChallengePanel
            challenge={projection.jammedDoorChallenge}
            players={projection.players.filter((player) => player.role === 'seeker').map((player) => ({ playerId: player.playerId, displayName: player.displayName }))}
            viewerRole={viewerRole}
            viewerPlayerId={activeMatch?.recipient.playerId}
            disabled={state.loadState === 'loading'}
            onRoll={(playerId, doorwayId, doorwayLabel, dieOne, dieTwo) => void submitCommand({ type: 'report_jammed_door_roll', payload: { sourceCardInstanceId: projection.jammedDoorChallenge!.sourceCardInstanceId, doorwayId, doorwayLabel, dieOne, dieTwo, doorwayVisible: true, targetPlayerId: viewerRole === 'host' ? playerId : undefined } })}
          />
        </Panel>
      ) : null}

      {projection?.zoologistChallenge ? (
        <Panel title="Curse of the Zoologist" subtitle="Photograph a wild animal in the hider’s chosen category." tone="accent">
          <Text style={styles.copy}>Category: {projection.zoologistChallenge.category}. Players compare the photos and decide whether each animal is wild and belongs to this category.</Text>
          {projection.players.filter((player) => projection.zoologistChallenge?.requiredSeekerPlayerIds.includes(player.playerId)).map((player) => (
            <Text key={player.playerId} style={styles.copy}>
              {player.displayName}: {projection.zoologistChallenge?.attachmentIdBySeekerPlayerId[player.playerId] ? 'photo recorded' : 'photo needed'}
            </Text>
          ))}
          {viewerRole === 'seeker' && !projection.zoologistChallenge.attachmentIdBySeekerPlayerId[activeMatch?.recipient.playerId ?? ''] ? (
            <AppButton
              label="Submit my matching photo"
              disabled={state.loadState === 'loading' || !zoologistSeekerAttachmentId}
              onPress={() => zoologistSeekerAttachmentId && void submitCommand({
                type: 'report_zoologist_evidence',
                payload: { sourceCardInstanceId: projection.zoologistChallenge!.sourceCardInstanceId, attachmentId: zoologistSeekerAttachmentId }
              })}
            />
          ) : null}
        </Panel>
      ) : null}

      {projection?.luxuryCarChallenge ? (
        <Panel title="Curse of the Luxury Car" subtitle="Find a more expensive car and agree on its production-year MSRP." tone="accent">
          <LuxuryCarChallengePanel
            challenge={projection.luxuryCarChallenge}
            viewerRole={viewerRole}
            photoAttachmentId={luxuryCarSeekerAttachmentId}
            disabled={state.loadState === 'loading'}
            onSubmit={(candidate) => void submitCommand({
              type: 'report_luxury_car_candidate',
              payload: { sourceCardInstanceId: projection.luxuryCarChallenge!.sourceCardInstanceId, ...candidate }
            })}
            onDecide={(accepted) => void submitCommand({
              type: 'decide_luxury_car_candidate',
              payload: { sourceCardInstanceId: projection.luxuryCarChallenge!.sourceCardInstanceId, accepted }
            })}
          />
        </Panel>
      ) : null}

      {projection?.uTurnChallenge ? (
        <Panel title="Curse of the U-Turn" subtitle="Leave the current service at the next qualifying stop." tone="accent">
          <UTurnChallengePanel
            challenge={projection.uTurnChallenge}
            players={projection.players.filter((player) => projection.uTurnChallenge?.requiredSeekerPlayerIds.includes(player.playerId)).map((player) => ({ playerId: player.playerId, displayName: player.displayName }))}
            viewerRole={viewerRole}
            viewerPlayerId={activeMatch?.recipient.playerId}
            disabled={state.loadState === 'loading'}
            onReport={(stationName, targetPlayerId) => void submitCommand({
              type: 'report_u_turn_disembarkation',
              payload: { sourceCardInstanceId: projection.uTurnChallenge!.sourceCardInstanceId, stationName, targetPlayerId }
            })}
          />
        </Panel>
      ) : null}

      {projection?.ransomNoteChallenge ? (
        <Panel title="Curse of the Ransom Note" subtitle="Submit and approve one cut-out question before it can be asked." tone="accent">
          <RansomNoteChallengePanel
            challenge={projection.ransomNoteChallenge}
            viewerRole={viewerRole}
            disabled={state.loadState === 'loading'}
            onSubmit={(noteText, printedCutoutsConfirmed) => void submitCommand({
              type: 'report_ransom_note_question',
              payload: { sourceCardInstanceId: projection.ransomNoteChallenge!.sourceCardInstanceId, noteText, printedCutoutsConfirmed }
            })}
            onDecide={(accepted) => void submitCommand({
              type: 'decide_ransom_note_question',
              payload: { sourceCardInstanceId: projection.ransomNoteChallenge!.sourceCardInstanceId, accepted }
            })}
          />
        </Panel>
      ) : null}

      {projection?.cairnChallenge ? (
        <Panel title="Curse of the Cairn" subtitle="Rebuild the hider’s one-attempt tower as a team." tone="accent">
          <CairnChallengePanel
            challenge={projection.cairnChallenge}
            viewerRole={viewerRole}
            disabled={state.loadState === 'loading'}
            onBeginPlacement={() => void submitCommand({ type: 'begin_cairn_rock_placement', payload: { sourceCardInstanceId: projection.cairnChallenge!.sourceCardInstanceId } })}
            onConfirmStable={() => void submitCommand({ type: 'confirm_cairn_rock_stable', payload: { sourceCardInstanceId: projection.cairnChallenge!.sourceCardInstanceId } })}
            onReportFallen={() => void submitCommand({ type: 'report_cairn_tower_fallen', payload: { sourceCardInstanceId: projection.cairnChallenge!.sourceCardInstanceId } })}
          />
        </Panel>
      ) : null}

      {activeMatch && latestLateResolvedQuestion && viewerRole === 'hider' ? (
        <StateBanner
          tone="warning"
          title="Late answer — no card reward"
          detail="The answer arrived after its response timer. The map result still counts, but the printed rules do not award cards for a late answer."
        />
      ) : null}

      {activeMatch && latestResolvedQuestion && !latestResolvedQuestion.lateResponseStartedAt &&
      !latestResolvedQuestion.cardRewardStatus && !pendingQuestionReward && viewerRole === 'hider' ? (
        <Panel title="Your clue reward" subtitle="The answer is locked in. Draw the printed cards, then choose what to keep." tone="accent">
          <Text style={styles.copy}>The seekers have their map update. Claim your card reward to unlock the next question.</Text>
          {projection?.questionRewardDrawBonus?.opportunitiesRemaining ? (
            <View style={styles.rewardBonusChoice}>
              <View style={styles.rewardBonusCopy}>
                <Text style={styles.rewardBonusTitle}>Overflowing Chalice</Text>
                <Text style={styles.copy}>Use one of {projection.questionRewardDrawBonus.opportunitiesRemaining} bonus draws? You keep the same number of cards.</Text>
              </View>
              <Switch value={useQuestionRewardDrawBonus} onValueChange={setUseQuestionRewardDrawBonus} />
            </View>
          ) : null}
          <AppButton
            label="Draw clue reward"
            onPress={() => void submitCommand({
              type: 'deal_question_reward',
              payload: {
                questionInstanceId: latestResolvedQuestion.questionInstanceId,
                ...(useQuestionRewardDrawBonus ? { useQuestionRewardDrawBonus: true } : {})
              }
            })}
            disabled={state.loadState === 'loading'}
          />
        </Panel>
      ) : null}

      {pendingQuestionReward && (viewerRole === 'hider' || viewerRole === 'host') ? (
        <Panel title="Pick your clue reward" subtitle="Choose the required number from each separate draw." tone="accent">
          {pendingQuestionReward.bonusDrawCount ? (
            <Text style={styles.copy}>The Chalice added {pendingQuestionReward.bonusDrawCount} card to the draw. Your keep count stays the same.</Text>
          ) : null}
          {pendingQuestionReward.sets.map((set, index) => {
            const selectedIds = selectedRewardCardIdsBySet[index] ?? [];
            const cards = deckViewModels.flatMap((deck) => deck.visibleCards)
              .filter((card) => set.cardInstanceIds.includes(card.card.cardInstanceId));
            return (
              <View key={`${pendingQuestionReward.questionInstanceId}:${set.setIndex}`} style={styles.rewardSet}>
                <Text style={styles.rewardSetTitle}>Draw {set.cardInstanceIds.length} · Pick {set.pickCount}</Text>
                <CardZoneSection
                  title={`Reward set ${set.setIndex + 1}`}
                  cards={cards}
                  emptyText="Waiting for your private card selection."
                  selectedCardInstanceIds={selectedIds}
                  onSelect={(cardId) => setSelectedRewardCardIdsBySet((current) => {
                    const next = [...current];
                    const selected = next[index] ?? [];
                    next[index] = selected.includes(cardId)
                      ? selected.filter((candidate) => candidate !== cardId)
                      : [...selected, cardId].slice(-set.pickCount);
                    return next;
                  })}
                />
                <Text style={styles.copy}>{selectedIds.length} / {set.pickCount} selected</Text>
              </View>
            );
          })}
          {rewardWouldExceedHand ? (
            <StateBanner tone="warning" title="Make room in your hand" detail={`Your hand has ${handCardIds.length} cards. Discard ${handCardIds.length + pendingQuestionReward.sets.reduce((count, set) => count + set.pickCount, 0) - hiderHandLimit} before keeping this reward.`} />
          ) : null}
          <AppButton
            label="Keep selected cards"
            onPress={() => void submitCommand({
              type: 'choose_question_reward',
              payload: {
                questionInstanceId: pendingQuestionReward.questionInstanceId,
                selectedCardInstanceIdsBySet: selectedRewardCardIdsBySet
              }
            })}
            disabled={!rewardSelectionValid || rewardWouldExceedHand || state.loadState === 'loading'}
          />
        </Panel>
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
              <Text style={styles.heroEyebrow}>YOUR NEXT MOVE</Text>
              <Text style={styles.heroTitle}>
                {selectedDeck?.deck.name ?? 'Choose a deck'}
              </Text>
              <Text style={styles.heroCopy}>
                {describeDeckFlowStep(
                  projection?.lifecycleState,
                  projection?.seekPhaseSubstate
                )}
              </Text>
            </View>
          </View>
          <Text style={styles.handCounter}>
            {handCardIds.length}
            <Text style={styles.handCounterLabel}>
              {' '}
              / {hiderHandLimit} cards in hand
            </Text>
          </Text>

          <View style={styles.heroActions}>
            {canPrepareFlow ? (
              <View style={styles.actionCell}>
                <AppButton
                  label={
                    state.loadState === 'loading'
                      ? 'Working...'
                      : 'Start Hide Phase'
                  }
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
                    ? `Draw ${cardsNeededToReachTarget} cards`
                    : 'Your hand is ready'
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
                label="Draw one card"
                tone="secondary"
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
                label="Refresh hand"
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
          {deckViewModels.length > 1 ? (
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
                  <Text style={styles.deckSummaryTitle}>
                    {selectedDeck.deck.name}
                  </Text>
                  <Text style={styles.deckSummaryMeta}>
                    {formatDeckOwnerScope(selectedDeck.deck.ownerScope)} ·{' '}
                    {selectedScale ?? 'Waiting for setup'}
                  </Text>
                  <Text style={styles.copy}>{selectedDeckVisibility}</Text>
                </View>
              </Panel>
            </>
          ) : null}

          <Panel
            title="Live Hand"
            subtitle="Main hand, fresh draws, response picks, and active effects."
          >
            {canManageHiderDeck ? (
              <View style={styles.handSummary}>
                <View style={styles.chipRow}>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>
                      {handCardIds.length} / {hiderHandLimit}
                    </Text>
                    <Text style={styles.infoLabel}>Hand target</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>
                      {cardsNeededToReachTarget > 0
                        ? `${cardsNeededToReachTarget} more`
                        : 'Ready'}
                    </Text>
                    <Text style={styles.infoLabel}>Need to draw</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>
                      {activeQuestionCategory?.name ?? 'No live clue'}
                    </Text>
                    <Text style={styles.infoLabel}>Active clue</Text>
                  </View>
                  <View style={styles.infoChip}>
                    <Text style={styles.infoValue}>
                      {selectedResponseCards.length} / {responseSelectionLimit}
                    </Text>
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
                          selectedResponseCardIds.includes(
                            selectedCard.card.cardInstanceId
                          )
                            ? 'Remove From Picks'
                            : `Add To Picks (${responseSelectionLimit} max)`
                        }
                        onPress={() => {
                          setSelectedResponseCardIds((current) => {
                            const cardId = selectedCard.card.cardInstanceId;
                            if (current.includes(cardId)) {
                              return current.filter(
                                (candidate) => candidate !== cardId
                              );
                            }

                            return [...current, cardId].slice(
                              -responseSelectionLimit
                            );
                          });
                        }}
                        tone="secondary"
                        disabled={state.loadState === 'loading'}
                      />
                    </View>
                  ) : null}
                  {selectedCard?.card.zone === 'hand' &&
                  drawTrayCardIds.includes(selectedCard.card.cardInstanceId) ? (
                    <View style={styles.actionCell}>
                      <AppButton
                        label="Mark As Keep"
                        onPress={() => {
                          setDrawTrayCardIds((current) =>
                            current.filter(
                              (candidate) =>
                                candidate !== selectedCard.card.cardInstanceId
                            )
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
            {drawTrayCards.length > 0 ? (
              <CardZoneSection
                title="Temporary Draw Tray"
                cards={drawTrayCards}
                emptyText="No freshly drawn hand cards are waiting for review."
                selectedCardInstanceId={selectedCard?.card.cardInstanceId}
                onSelect={setSelectedCardInstanceId}
              />
            ) : null}
            {selectedResponseCards.length > 0 ? (
              <CardZoneSection
                title="Selected Response Cards"
                cards={selectedResponseCards}
                emptyText="No response cards are marked yet."
                selectedCardInstanceId={selectedCard?.card.cardInstanceId}
                onSelect={setSelectedCardInstanceId}
              />
            ) : null}
            {selectedDeck.visibleByZone.pending_resolution.length > 0 ? (
              <CardZoneSection
                title="Cards Awaiting Resolution"
                cards={selectedDeck.visibleByZone.pending_resolution}
                emptyText="No pending-resolution cards are visible in this deck right now."
                selectedCardInstanceId={selectedCard?.card.cardInstanceId}
                onSelect={setSelectedCardInstanceId}
              />
            ) : null}
          </Panel>

          <AppButton
            label={
              showPiles
                ? 'Hide piles & discards'
                : 'Inspect draw pile & discards'
            }
            tone="ghost"
            onPress={() => setShowPiles(!showPiles)}
          />
          {showPiles ? (
            <>
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
        </>
      ) : null}

      {selectedCard && (selectedCard.card.zone !== 'draw_pile' || showPiles) ? (
        <>
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
              playDisabledReason={selectedCardIsDuplicate ? 'Choose the card to copy below.' : selectedCardActionState.playReason}
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
        </>
      ) : null}

      {selectedCardIsDuplicate && selectedCard ? (
        <Panel
          title="Choose a card to copy"
          subtitle="Duplicate is spent; the original stays in your hand. Time bonuses remain in hand for capture scoring."
          tone="accent"
        >
          {duplicateTargets.length === 0 ? (
            <Text style={styles.copy}>No other playable card is in this hand.</Text>
          ) : duplicateTargets.map((target) => (
            <AppButton
              key={target.card.cardInstanceId}
              label={`Copy ${target.definition.name}`}
              tone="secondary"
              disabled={!canPlayCards(projection) || state.loadState === 'loading'}
              onPress={() => {
                void submitCommand({
                  type: 'play_card',
                  payload: {
                    cardInstanceId: selectedCard.card.cardInstanceId,
                    duplicateTargetCardInstanceId: target.card.cardInstanceId
                  }
                });
              }}
            />
          ))}
        </Panel>
      ) : null}

      {projection?.activeCardResolution ? (
        <>
          <Panel
            title="Card Window"
            subtitle="Resolve the current effect when the state allows it."
          >
            <CardResolutionStatusPanel
              activeCard={activeCard}
              copiedCard={copiedCard}
              resolution={projection?.activeCardResolution}
              zoologistHiderAttachmentId={zoologistHiderAttachmentId}
              luxuryCarHiderAttachmentId={luxuryCarHiderAttachmentId}
              labyrinthHiderAttachmentId={labyrinthHiderAttachmentId}
              unguidedTouristHiderAttachmentId={touristHiderAttachmentId}
              birdGuideHiderAttachmentId={birdGuideHiderAttachmentId}
              mediocreTravelAgentTransitStatusByPlayerId={projection.activeCardResolution.mediocreTravelAgentTransitStatusByPlayerId}
              mediocreTravelAgentSeekerPlayerIds={projection.players.filter((player) => player.role === 'seeker').map((player) => player.playerId)}
              onSetMediocreTravelAgentTransitContext={(onTransitOrAtStation) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({ type: 'set_seeker_transit_context', payload: { sourceCardInstanceId, onTransitOrAtStation } });
              }}
              unguidedTouristOutdoorsConfirmedByPlayerIds={projection.activeCardResolution.unguidedTouristOutdoorsConfirmedByPlayerIds}
              unguidedTouristSeekerPlayerIds={projection.players.filter((player) => player.role === 'seeker').map((player) => player.playerId)}
              viewerPlayerId={activeMatch?.recipient.playerId}
              onConfirmUnguidedTouristOutdoors={() => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({ type: 'confirm_unguided_tourist_outdoors', payload: { sourceCardInstanceId } });
              }}
              canResolve={canResolve}
              resolveDisabledReason={resolveDisabledReason}
              questionCategories={contentPack.questionCategories}
              questionTemplates={contentPack.questionTemplates}
              selectedScale={selectedScale}
              viewerRole={viewerRole}
              disabled={state.loadState === 'loading'}
              onSetHangmanWord={(word) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'set_hangman_word', payload: { sourceCardInstanceId, word }
                });
              }}
              onGuessHangmanLetter={(letter) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'guess_hangman_letter', payload: { sourceCardInstanceId, letter }
                });
              }}
              onEndHangmanChallenge={() => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'end_hangman_challenge', payload: { sourceCardInstanceId }
                });
              }}
              onPublishLabyrinthMaze={(attachmentId) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'publish_labyrinth_maze', payload: { sourceCardInstanceId, attachmentId }
                });
              }}
              onSubmitLabyrinthSolution={(solutionText) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'submit_labyrinth_solution', payload: { sourceCardInstanceId, solutionText }
                });
              }}
              onReviewLabyrinthSolution={(approved) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'review_labyrinth_solution', payload: { sourceCardInstanceId, approved }
                });
              }}
              onResolveEndlessTumbleCast={(dieRoll) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'resolve_endless_tumble_cast', payload: { sourceCardInstanceId, dieRoll }
                });
              }}
              onResolveGamblersFeetCast={(dieRoll) => {
                const sourceCardInstanceId = projection?.activeCardResolution?.sourceCardInstanceId;
                if (sourceCardInstanceId) void submitCommand({
                  type: 'resolve_gamblers_feet_cast', payload: { sourceCardInstanceId, dieRoll }
                });
              }}
              onResolve={(questionTemplateIds, zoologistSelection, luxuryCarSelection, uTurnSelection, ransomNoteSelection, cairnSelection, unguidedTouristSelection, birdGuideSelection, mediocreTravelAgentSelection) => {
                if (!projection?.activeCardResolution?.sourceCardInstanceId) {
                  return;
                }

                void submitCommand({
                  type: 'resolve_card_window',
                  payload: {
                    sourceCardInstanceId:
                      projection.activeCardResolution.sourceCardInstanceId,
                    ...(questionTemplateIds.length > 0 ? { questionTemplateIds } : {}),
                    ...(zoologistSelection ? {
                      zoologistCategory: zoologistSelection.category,
                      zoologistHiderAttachmentId: zoologistSelection.hiderAttachmentId
                    } : {}),
                    ...(luxuryCarSelection ? {
                      luxuryCarHiderAttachmentId: luxuryCarSelection.hiderAttachmentId,
                      luxuryCarDescription: luxuryCarSelection.description,
                      luxuryCarProductionYear: luxuryCarSelection.productionYear,
                      luxuryCarMsrpCents: luxuryCarSelection.msrpCents,
                      luxuryCarCurrencyCode: luxuryCarSelection.currencyCode
                    } : {}),
                    ...(uTurnSelection ? {
                      uTurnNextStationName: uTurnSelection.nextStationName,
                      uTurnPreconditionsConfirmed: uTurnSelection.preconditionsConfirmed
                    } : {}),
                    ...(ransomNoteSelection ? {
                      ransomNoteCastingCostConfirmed: ransomNoteSelection.castingCostConfirmed
                    } : {}),
                    ...(cairnSelection ? {
                      cairnTargetHeight: cairnSelection.targetHeight,
                      cairnTargetConfirmed: cairnSelection.targetConfirmed
                    } : {}),
                    ...(unguidedTouristSelection ? {
                      unguidedTouristHiderAttachmentId: unguidedTouristSelection.hiderAttachmentId,
                      unguidedTouristRulesAttested: unguidedTouristSelection.rulesAttested
                    } : {}),
                    ...(birdGuideSelection ? {
                      birdGuideHiderAttachmentId: birdGuideSelection.hiderAttachmentId,
                      birdGuideBirdPresentAttested: birdGuideSelection.birdPresentAttested
                    } : {}),
                    ...(mediocreTravelAgentSelection ? {
                      mediocreTravelAgentDestinationName: mediocreTravelAgentSelection.destinationName,
                      mediocreTravelAgentLatitude: mediocreTravelAgentSelection.destinationLatitude,
                      mediocreTravelAgentLongitude: mediocreTravelAgentSelection.destinationLongitude,
                      mediocreTravelAgentPublicAccessAttested: mediocreTravelAgentSelection.publicAccessAttested
                    } : {})
                  }
                });
              }}
            />
          </Panel>
        </>
      ) : null}

      {cardAttachmentContext ? (
        <Panel
          title="Card Evidence"
          subtitle="Add photo proof when the effect needs it."
        >
          <EvidenceCapturePanel
            context={cardAttachmentContext}
            cameraOnly={projection?.activeCardResolution?.resolutionKind === 'zoologist_challenge' ||
              projection?.activeCardResolution?.resolutionKind === 'labyrinth_challenge' ||
              projection?.activeCardResolution?.resolutionKind === 'luxury_car_challenge' ||
              projection?.activeCardResolution?.resolutionKind === 'mediocre_travel_agent_challenge' ||
              Boolean(projection?.zoologistChallenge) || Boolean(projection?.luxuryCarChallenge) || Boolean(projection?.unguidedTouristChallenge) || Boolean(projection?.mediocreTravelAgentChallenge)}
            videoOnly={cardAttachmentContext.attachmentKind === 'video_evidence'}
            videoMaxDurationSeconds={(birdGuideMaximumDurationMinutes ?? 5) * 60}
            drafts={cardEvidenceDrafts}
            visibleAttachments={activeCardEvidenceContext?.attachments ?? []}
            disabled={
              !activeMatch ||
              state.loadState === 'loading' ||
              viewerRole === 'spectator' ||
              (Boolean(projection?.mediocreTravelAgentChallenge) && viewerRole !== 'seeker' && viewerRole !== 'host') ||
              (cardAttachmentContext.attachmentKind === 'video_evidence' && !(projection?.activeCardResolution?.resolutionKind === 'bird_guide_challenge'
                ? viewerRole === 'hider' || viewerRole === 'host'
                : Boolean(projection?.birdGuideChallenge) && viewerRole === 'seeker'))
            }
            busy={localMedia.isContextBusy(cardAttachmentContext.contextId)}
            feedback={localMedia.getContextFeedback(
              cardAttachmentContext.contextId
            )}
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
            onRecordVideo={() => {
              void localMedia.recordVideo(cardAttachmentContext, (birdGuideMaximumDurationMinutes ?? 5) * 60);
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
  rewardBonusChoice: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
    padding: 12
  },
  rewardBonusCopy: { flex: 1, gap: 4 },
  rewardBonusTitle: {
    color: colors.accentStrong,
    fontSize: 13,
    fontWeight: '800'
  },
  rewardSet: {
    borderColor: colors.border,
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14
  },
  rewardSetTitle: {
    color: colors.accentStrong,
    fontFamily: fonts.mono,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  handCounter: {
    fontFamily: fonts.mono,
    fontSize: 40,
    color: colors.accentStrong,
    fontWeight: '800'
  },
  handCounterLabel: {
    fontSize: 13,
    color: colors.textMuted,
    fontFamily: fonts.mono
  },
  heroCard: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 12,
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
    fontFamily: fonts.display,
    fontSize: 28,
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
    flexBasis: 220,
    flexGrow: 1
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  checkboxRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10
  },
  checkbox: {
    alignItems: 'center',
    borderColor: colors.borderStrong,
    borderRadius: 6,
    borderWidth: 1,
    height: 24,
    justifyContent: 'center',
    width: 24
  },
  checkboxChecked: {
    backgroundColor: colors.accent
  },
  checkboxMark: {
    color: colors.text,
    fontWeight: '900'
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
