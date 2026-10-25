import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { buildQuestionSelectionState } from '../../../../packages/domain/src/index.ts';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import {
  buildEvidenceContexts,
  EvidenceCapturePanel,
  useLocalMediaAttachments,
  type LocalEvidenceContextDescriptor
} from '../features/evidence/index.ts';
import {
  QuestionAnswerComposer,
  QuestionCategoryList,
  QuestionResolutionPanel,
  QuestionTemplateList,
  buildAnswerPayload,
  buildAskQuestionPayload,
  buildConstraintResolutionMetadata,
  buildQuestionCategoryViewModels,
  buildQuestionFlowBootstrapCommands,
  describeExpectedAnswerGuidance,
  describeQuestionCategoryForPlayers,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  filterTemplatesForScale,
  formatQuestionScaleSet,
  formatHiderCardReward,
  formatTimerPolicyLabel,
  isQuestionDistanceChoice,
  parseChosenDistanceMeters,
  buildQuestionMapEffectModel,
  chooseConstraintIdForQuestion,
  createInitialAnswerDraft,
  appendAttachmentIdToDraft,
  describeTemplateSupport,
  requiresMovingTransitConfirmation,
  findActiveQuestion,
  findConstraintForQuestion,
  findLatestResolvedQuestion,
  findQuestionCategory,
  findQuestionTemplate,
  getQuestionFlowCapabilities,
  hasQuestionPhotoEvidence,
  getSeedRegionFeatureData,
  type QuestionAnswerDraft
} from '../features/questions/index.ts';
import {
  MatchTimingBanner,
  MatchTimingPanel,
  formatCountdown,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function resolveCurrentRole(
  role: string | undefined,
  scope: string | undefined
) {
  if (role === 'host' || scope === 'host_admin') {
    return 'host' as const;
  }

  if (role === 'hider') {
    return 'hider' as const;
  }

  if (role === 'seeker') {
    return 'seeker' as const;
  }

  return 'spectator' as const;
}

function formatRoleLabel(role: string) {
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPhaseLabel(
  lifecycleState: string | undefined,
  seekPhaseSubstate: string | undefined
) {
  if (!lifecycleState) {
    return 'Unavailable';
  }

  const lifecycleLabel = lifecycleState
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
  if (!seekPhaseSubstate) {
    return lifecycleLabel;
  }

  const substateLabel = seekPhaseSubstate
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
  return `${lifecycleLabel} · ${substateLabel}`;
}

function describeQuestionFlowStep(
  lifecycleState: string | undefined,
  seekPhaseSubstate: string | undefined
) {
  if (!lifecycleState) {
    return 'Waiting for the live match';
  }

  if (lifecycleState === 'hide_phase') {
    return 'Wait for hide phase to end';
  }

  if (lifecycleState === 'game_complete') {
    return 'Match complete';
  }

  if (lifecycleState === 'endgame' && (!seekPhaseSubstate || seekPhaseSubstate === 'ready')) {
    return 'Ask another clue at the final spot';
  }

  if (lifecycleState !== 'seek_phase' && lifecycleState !== 'endgame') {
    return formatPhaseLabel(lifecycleState, seekPhaseSubstate);
  }

  switch (seekPhaseSubstate) {
    case 'ready':
      return lifecycleState === 'endgame' ? 'Ask another clue at the final spot' : 'Ask the next clue';
    case 'awaiting_question_selection':
      return 'Choose the next clue';
    case 'awaiting_question_answer':
      return 'Answer the live clue';
    case 'applying_constraints':
      return 'Update the map from the answer';
    case 'awaiting_card_resolution':
      return 'Finish the open card effect';
    case 'cooldown':
      return 'Wait for cooldown to end';
    default:
      return 'Follow the live clue flow';
  }
}

export function QuestionCenterScreen() {
  const [showGameContext, setShowGameContext] = useState(false);
  const [chosenDistanceDraft, setChosenDistanceDraft] = useState('');
  const {
    state,
    submitCommand,
    submitCommands,
    refreshActiveMatch,
    prepareAttachmentUploadCommands,
    getContentPackByReference
  } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const contentPack = getContentPackByReference(projection?.contentPackId, projection?.contentPackVersion);
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(
    activeMatch?.playerRole,
    activeMatch?.recipient.scope
  );
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const capabilities = getQuestionFlowCapabilities(viewerRole);
  const categoryViewModels = useMemo(
    () => buildQuestionCategoryViewModels(contentPack),
    [contentPack]
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    string | undefined
  >(categoryViewModels[0]?.category.categoryId);
  const [selectedTemplateId, setSelectedTemplateId] = useState<
    string | undefined
  >(categoryViewModels[0]?.templates[0]?.templateId);
  const activeQuestion = findActiveQuestion(projection);
  const latestQuestion = projection?.visibleQuestions[projection.visibleQuestions.length - 1];
  const resolvedQuestion = findLatestResolvedQuestion(projection);
  const activeQuestionTemplate = findQuestionTemplate(
    contentPack,
    activeQuestion?.templateId
  );
  const activeQuestionCategory = findQuestionCategory(
    contentPack,
    activeQuestion?.categoryId
  );
  const resolvedQuestionTemplate = findQuestionTemplate(
    contentPack,
    resolvedQuestion?.templateId
  );
  const resolvedQuestionCategory = findQuestionCategory(
    contentPack,
    resolvedQuestion?.categoryId
  );
  const selectedCategory = findQuestionCategory(
    contentPack,
    selectedCategoryId
  );
  const availableTemplates = filterTemplatesForScale(
    categoryViewModels.find(
      (entry) => entry.category.categoryId === selectedCategoryId
    )?.templates ?? [],
    selectedScale
  );
  const selectedTemplate = findQuestionTemplate(
    contentPack,
    selectedTemplateId
  );
  const [answerDraft, setAnswerDraft] = useState<QuestionAnswerDraft>(() =>
    createInitialAnswerDraft(selectedTemplate)
  );
  const [confirmedMovingTransit, setConfirmedMovingTransit] = useState(false);
  const activeSelectionRound = useMemo(
    () =>
      selectedCategory
        ? buildQuestionSelectionState({
            contentPack: contentPack,
            category: selectedCategory,
            selectedScale,
            askedQuestions: (projection?.visibleQuestions ?? []).map(
              (question) => ({
                templateId: question.templateId,
                categoryId: question.categoryId,
                askedAt: question.askedAt,
                status: question.status
              })
            )
          })
        : undefined,
    [projection?.visibleQuestions, selectedCategory, selectedScale]
  );
  const readyTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.availableTemplateIds.includes(template.templateId)
  );
  const readyTemplate =
    readyTemplates.find(
      (template) => template.templateId === selectedTemplateId
    ) ??
    readyTemplates[0];
  const selectedQuestionIsDisabled = Boolean(
    readyTemplate && projection?.disabledQuestionTemplateIds?.includes(readyTemplate.templateId)
  );
  const previewTemplate = readyTemplate ?? selectedTemplate;
  const requiresTransitConfirmation = Boolean(
    previewTemplate && requiresMovingTransitConfirmation(previewTemplate)
  );
  const ruleLabel = selectedCategory
    ? formatHiderCardReward(selectedCategory)
    : undefined;
  const selectedRewardMultiplier = previewTemplate
    ? activeSelectionRound?.rewardMultiplierByTemplate[previewTemplate.templateId] ?? 1
    : 1;
  const selectedRewardLabel = selectedCategory
    ? formatHiderCardReward(selectedCategory, selectedRewardMultiplier)
    : undefined;
  const timerLabel = selectedCategory
    ? formatTimerPolicyLabel(selectedCategory.defaultTimerPolicy, selectedScale)
    : undefined;

  useEffect(() => {
    if (!selectedCategoryId && categoryViewModels[0]) {
      setSelectedCategoryId(categoryViewModels[0].category.categoryId);
    }
  }, [categoryViewModels, selectedCategoryId]);

  useEffect(() => {
    const lockedCategoryId = projection?.disabledQuestionCategoryId;
    if (lockedCategoryId && selectedCategoryId === lockedCategoryId) {
      const nextCategory = categoryViewModels.find(
        (entry) => entry.category.categoryId !== lockedCategoryId
      );
      if (nextCategory) setSelectedCategoryId(nextCategory.category.categoryId);
    }
  }, [categoryViewModels, projection?.disabledQuestionCategoryId, selectedCategoryId]);

  useEffect(() => {
    const selectableTemplateIds =
      activeSelectionRound?.availableTemplateIds ?? [];
    if (
      !selectedTemplateId ||
      (selectableTemplateIds.length > 0 &&
        !selectableTemplateIds.includes(selectedTemplateId)) ||
      (selectableTemplateIds.length === 0 &&
        !availableTemplates.some(
          (template) => template.templateId === selectedTemplateId
        ))
    ) {
      setSelectedTemplateId(
          activeSelectionRound?.availableTemplateIds[0] ?? availableTemplates[0]?.templateId
      );
    }
  }, [activeSelectionRound, availableTemplates, selectedTemplateId]);

  useEffect(() => {
    setChosenDistanceDraft('');
  }, [readyTemplate?.templateId]);

  useEffect(() => {
    setConfirmedMovingTransit(false);
  }, [previewTemplate?.templateId]);

  useEffect(() => {
    const composerTemplate =
      activeQuestion?.status === 'awaiting_answer'
        ? activeQuestionTemplate
        : readyTemplate;
    setAnswerDraft(createInitialAnswerDraft(composerTemplate));
  }, [
    activeQuestion?.questionInstanceId,
    activeQuestion?.status,
    activeQuestionTemplate,
    readyTemplate
  ]);

  const visibleMap = projection?.visibleMap;
  const selectedRegionId = visibleMap?.regionId;
  const selectedQuestionImpact =
    previewTemplate && selectedCategory
      ? describeQuestionImpactExpectation({
          template: previewTemplate,
          category: selectedCategory,
          regionId: selectedRegionId
        })
      : undefined;
  const previewFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (previewTemplate?.featureClassRefs ?? []).map(
      (feature) => feature.featureClassId
    )
  );
  const answerFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (activeQuestionTemplate?.featureClassRefs ?? []).map(
      (feature) => feature.featureClassId
    )
  );
  const activeQuestionConstraint = findConstraintForQuestion(
    projection,
    activeQuestion?.questionInstanceId
  );
  const resolvedQuestionConstraint = findConstraintForQuestion(
    projection,
    resolvedQuestion?.questionInstanceId
  );
  const evidenceContexts = useMemo(
    () => buildEvidenceContexts(contentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const activeQuestionEvidenceContext = evidenceContexts.find(
    (context) => context.kind === 'question'
  );
  const hasRequiredQuestionEvidence = hasQuestionPhotoEvidence(
    activeQuestionCategory,
    activeQuestion?.questionInstanceId,
    activeQuestionEvidenceContext?.attachments ?? []
  );
  const questionAttachmentContext = useMemo<
    LocalEvidenceContextDescriptor | undefined
  >(
    () =>
      activeQuestionEvidenceContext
        ? {
            contextId: activeQuestionEvidenceContext.contextId,
            kind: 'question',
            title: activeQuestionEvidenceContext.title,
            detail: activeQuestionEvidenceContext.detail,
            visibilityScope:
              activeQuestionEvidenceContext.suggestedVisibilityScope,
            teamId: activeQuestionEvidenceContext.teamId,
            attachmentKind: 'photo_evidence',
            questionInstanceId: activeQuestionEvidenceContext.questionInstanceId
          }
        : undefined,
    [activeQuestionEvidenceContext]
  );
  const questionEvidenceDrafts = questionAttachmentContext
    ? localMedia.getContextDrafts(questionAttachmentContext.contextId)
    : [];
  const latestResolvedEffect = useMemo(
    () =>
      buildQuestionMapEffectModel({
        question: resolvedQuestion,
        template: resolvedQuestionTemplate,
        category: resolvedQuestionCategory,
        constraint: resolvedQuestionConstraint,
        visibleMap
      }),
    [
      resolvedQuestion,
      resolvedQuestionCategory,
      resolvedQuestionConstraint,
      resolvedQuestionTemplate,
      visibleMap
    ]
  );
  const latestConstraintApplied = Boolean(
    state.lastSync?.eventStream.events.some(
      (eventFrame) => eventFrame.type === 'constraint_applied'
    ) && latestResolvedEffect
  );
  const isEndgameQuestionState = projection?.lifecycleState === 'endgame';
  const activeQuestionSubstate = projection?.seekPhaseSubstate ?? (isEndgameQuestionState ? 'ready' : undefined);
  const isQuestionReadyState =
    (projection?.lifecycleState === 'seek_phase' || isEndgameQuestionState) &&
    activeQuestionSubstate === 'ready';
  const isQuestionSelectionState =
    (projection?.lifecycleState === 'seek_phase' || isEndgameQuestionState) &&
    activeQuestionSubstate === 'awaiting_question_selection';
  const isAwaitingAnswer =
    (projection?.lifecycleState === 'seek_phase' || isEndgameQuestionState) &&
    activeQuestionSubstate === 'awaiting_question_answer';
  const isApplyingConstraints =
    (projection?.lifecycleState === 'seek_phase' || isEndgameQuestionState) &&
    activeQuestionSubstate === 'applying_constraints';
  const canPrepareFlow = Boolean(
    activeMatch &&
      capabilities.canPrepareFlow &&
      projection &&
      [
        'draft',
        'lobby',
        'role_assignment',
        'rules_confirmation',
        'map_setup'
      ].includes(projection.lifecycleState)
  );
  const bridgeTrollChallenge = projection?.bridgeTrollChallenge;
  const bridgeTrollSeekers = projection?.players.filter((player) => player.role === 'seeker') ?? [];
  const bridgeTrollAttestedIds = new Set(Object.keys(bridgeTrollChallenge?.attestedAtByPlayerId ?? {}));
  const bridgeTrollReady = Boolean(
    bridgeTrollChallenge &&
    bridgeTrollSeekers.length > 0 &&
    bridgeTrollSeekers.every((player) => bridgeTrollAttestedIds.has(player.playerId))
  );
  const canAskQuestion = Boolean(
    activeMatch &&
      capabilities.canAskQuestions &&
      readyTemplate &&
      (!isQuestionDistanceChoice(readyTemplate) || parseChosenDistanceMeters(chosenDistanceDraft) !== undefined) &&
      !selectedQuestionIsDisabled &&
      (!bridgeTrollChallenge || bridgeTrollReady) &&
      (isQuestionReadyState || isQuestionSelectionState)
  );
  const canAnswerQuestion = Boolean(
    activeMatch &&
      capabilities.canAnswerQuestions &&
      activeQuestion &&
      activeQuestionTemplate &&
      isAwaitingAnswer
  );
  const canResolveQuestion = Boolean(
    activeMatch &&
      capabilities.canResolveQuestions &&
      activeQuestion &&
      activeQuestionTemplate &&
      activeQuestionCategory &&
      isApplyingConstraints
  );
  const questionEvidenceHint =
    activeMatch?.onlineStatus?.attachmentStorageMode ===
    'durable_supabase_storage'
      ? 'Recording evidence here uploads the image to Supabase Storage and records durable attachment metadata in the match.'
      : activeMatch?.runtimeKind === 'online_foundation'
        ? 'Recording evidence here creates real attachment records through the runtime, but this online session is still falling back to metadata-only storage.'
        : 'Recording evidence here creates real attachment records through the runtime. The file preview stays local to this device session until fuller storage support is added.';
  const showQuestionPrepPanel = !liveGameplayState && canPrepareFlow;
  const activeQuestionTimerSeconds = timingModel?.timers.find(
    (timer) => timer.kind === 'question' && timer.status !== 'completed'
  )?.remainingSeconds;
  const availableQuestionLabel =
    selectedCategory && activeSelectionRound
      ? `${activeSelectionRound.availableTemplateIds.length} questions available`
      : undefined;

  const handlePrepareFlow = () => {
    if (!projection) {
      return;
    }

    const commands = buildQuestionFlowBootstrapCommands(projection);
    if (commands.length === 0) {
      void refreshActiveMatch();
      return;
    }

    void submitCommands(commands);
  };

  const handleAskQuestion = () => {
    if (!readyTemplate || !projection || !selectedCategory) {
      return;
    }

    const questionPayload = buildAskQuestionPayload({
      questionInstanceId: `question:${createUuid()}`,
      template: readyTemplate,
      targetTeamId: projection.teams.find((team) => team.side === 'hider')?.teamId ?? 'team-hider',
      chosenDistanceDraft,
      confirmedMovingTransit: requiresTransitConfirmation ? confirmedMovingTransit : undefined
    });
    if (!questionPayload) return;

    const commands = [];
    if (isQuestionReadyState) {
      commands.push({
        type: 'begin_question_prompt' as const,
        payload: {}
      });
    }

    commands.push({
      type: 'ask_question' as const,
      payload: questionPayload
    });

    setConfirmedMovingTransit(false);
    void submitCommands(commands);
  };

  const handleAnswerQuestion = () => {
    if (!activeQuestion || !activeQuestionTemplate) {
      return;
    }

    void submitCommand({
      type: 'answer_question',
      payload: {
        questionInstanceId: activeQuestion.questionInstanceId,
        answer: buildAnswerPayload(activeQuestionTemplate, answerDraft)
      }
    });
  };

  const handleNullQuestionAnswer = () => {
    if (!activeQuestion || !activeQuestion.randomizedNullAnswerAllowed) return;
    void submitCommand({
      type: 'answer_question',
      payload: {
        questionInstanceId: activeQuestion.questionInstanceId,
        answer: { value: null }
      }
    });
  };

  const handleCannotAnswerDuringEndgame = () => {
    if (!activeQuestion || !activeQuestionCategory || !isEndgameQuestionState) return;
    void submitCommand({
      type: 'answer_question',
      payload: {
        questionInstanceId: activeQuestion.questionInstanceId,
        answer: {
          cannotAnswerDueToEndgame: true,
          note: 'Impossible to complete because the hider is fixed at the final spot during endgame.'
        }
      }
    });
  };

  const handlePhotoSubjectAbsent = () => {
    if (!activeQuestion || activeQuestionCategory?.resolverKind !== 'photo_challenge') return;
    void submitCommand({
      type: 'answer_question',
      payload: {
        questionInstanceId: activeQuestion.questionInstanceId,
        answer: {
          value: null,
          cannotAnswerBecauseSubjectAbsent: true,
          note: 'The requested photo subject does not exist in the hiding zone.'
        }
      }
    });
  };

  const handleRecordQuestionEvidence = async () => {
    if (!questionAttachmentContext) {
      return;
    }

    const attachmentIds = questionEvidenceDrafts.map(
      (draft) => draft.attachmentId
    );
    const commands = await prepareAttachmentUploadCommands(
      questionEvidenceDrafts
    );
    if (!commands || commands.length === 0) {
      return;
    }

    localMedia.markSubmitting(attachmentIds);
    const succeeded = await submitCommands(commands);
    if (succeeded) {
      localMedia.markSubmitted(attachmentIds);
      setAnswerDraft((current) =>
        attachmentIds.reduce(
          (draft, attachmentId) =>
            appendAttachmentIdToDraft(draft, attachmentId),
          current
        )
      );
      return;
    }

    localMedia.resetToSelected(attachmentIds);
  };

  const handleResolveQuestion = () => {
    if (!activeQuestion || !activeQuestionTemplate || !activeQuestionCategory) {
      return;
    }

    const constraintId = chooseConstraintIdForQuestion({
      category: activeQuestionCategory,
      template: activeQuestionTemplate,
      question: activeQuestion
    });
    if (!constraintId) {
      return;
    }

    void submitCommand({
      type: 'apply_constraint',
      payload: {
        questionInstanceId: activeQuestion.questionInstanceId,
        constraintId,
        metadata: buildConstraintResolutionMetadata({
          contentPack: contentPack,
          visibleMap,
          template: activeQuestionTemplate,
          question: activeQuestion
        })
      }
    });
  };

  return (
    <ScreenContainer
      title="Follow the clues"
      eyebrow={
        liveGameplayState ? 'THE INVESTIGATION' : 'YOUR INVESTIGATION KIT'
      }
      subtitle={
        liveGameplayState
          ? 'Ask clever questions. Follow every answer. Close in on the hiding spot.'
          : 'Prepare the next clue, answer it honestly, and see clearly whether the map changed or the result stayed as evidence only.'
      }
      topSlot={
        liveGameplayState ? undefined : <ProductNavBar current="questions" />
      }
      bottomSlot={
        liveGameplayState ? <GameplayTabBar current="questions" /> : undefined
      }
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Question flows only run through an active runtime connection."
        />
      ) : null}

      {activeMatch ? (
        <AppButton
          label={
            showGameContext ? 'Hide game briefing' : 'Game briefing & timing'
          }
          tone="ghost"
          onPress={() => setShowGameContext(!showGameContext)}
        />
      ) : null}
      {activeMatch && showGameContext ? (
        <Panel
          title={liveGameplayState ? 'Clue Review' : 'Question Context'}
          subtitle={
            liveGameplayState
              ? 'The map now handles the fastest live clue actions. Use this screen for deeper review, more room, or a full clue walkthrough.'
              : 'See who can act right now, which workbook scale is active, and what the next question should accomplish.'
          }
        >
          <FactList
            items={[
              { label: 'Your Role', value: formatRoleLabel(viewerRole) },
              {
                label: 'Next Step',
                value: describeQuestionFlowStep(
                  projection?.lifecycleState,
                  projection?.seekPhaseSubstate
                )
              },
              {
                label: 'Game Map',
                value: visibleMap?.displayName ?? 'Not selected yet'
              },
              {
                label: 'Game Size',
                value: selectedScale
                  ? formatQuestionScaleSet([selectedScale])
                  : 'Waiting for setup'
              },
              {
                label: 'Live Update',
                value: timingModel?.freshnessLabel ?? 'Waiting for live state'
              }
            ]}
          />
          <Text style={styles.copy}>
            Seekers ask from the current workbook draw, hiders answer honestly,
            and the host applies the bounded result so everyone can trust the
            map.
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
      ) : null}

      {activeMatch && !visibleMap ? (
        <StateBanner
          tone="warning"
          title="Playable region needed first"
          detail="Finish map setup before relying on question results to change the search area."
        />
      ) : null}

      {activeMatch && viewerRole === 'spectator' ? (
        <StateBanner
          tone="info"
          title="Read-only spectator view"
          detail="Spectators can browse categories, inspect answers, and review bounded map updates, but cannot ask, answer, or resolve questions."
        />
      ) : null}

      <MatchTimingBanner model={timingModel} />

      {bridgeTrollChallenge ? (
        <Panel
          title="Curse of the Bridge Troll"
          subtitle="Every seeker must be under the same bridge when the next question is asked. Confirm from your own phone while you are there."
          tone="accent"
        >
          <FactList items={bridgeTrollSeekers.map((player) => ({
            label: player.displayName,
            value: bridgeTrollAttestedIds.has(player.playerId) ? 'Under a bridge · confirmed' : 'Confirmation needed'
          }))} />
          {viewerRole === 'seeker' ? (
            <AppButton
              label={bridgeTrollAttestedIds.has(activeMatch?.recipient.playerId ?? '') ? 'Update: I am no longer under the bridge' : 'Confirm I am under the bridge'}
              tone="secondary"
              disabled={state.loadState === 'loading'}
              onPress={() => {
                if (!bridgeTrollChallenge) return;
                void submitCommand({
                  type: 'set_bridge_troll_position',
                  payload: {
                    sourceCardInstanceId: bridgeTrollChallenge.sourceCardInstanceId,
                    underBridge: !bridgeTrollAttestedIds.has(activeMatch?.recipient.playerId ?? '')
                  }
                });
              }}
            />
          ) : null}
          <Text style={styles.helper}>
            If a seeker leaves the bridge, update their status here. The app enforces that everyone is marked under the bridge when the next question is asked; your group still judges whether the structure qualifies as a bridge.
          </Text>
        </Panel>
      ) : null}

      {latestConstraintApplied && latestResolvedEffect ? (
        <StateBanner
          tone={latestResolvedEffect.mapEffectTone}
          title={latestResolvedEffect.mapEffectTitle}
          detail={latestResolvedEffect.mapEffectDetail}
        />
      ) : null}

      {latestQuestion?.status === 'vetoed' ? (
        <StateBanner
          tone="info"
          title="Veto used"
          detail="The hider declined this clue. It has no answer or card reward, and it counts toward the repeat cost."
        />
      ) : null}

      {activeQuestion?.lateResponseStartedAt && !activeQuestion.lateResponseEndedAt ? (
        <StateBanner
          tone="warning"
          title="Answer overdue · hiding clock paused"
          detail="The response time ran out. Answer this clue to resume your hiding time; this late answer will not earn card draws."
        />
      ) : null}

      {latestQuestion?.status === 'resolved' && latestQuestion.lateResponseStartedAt ? (
        <StateBanner
          tone="warning"
          title="Late answer · no card reward"
          detail="The answer still updates the investigation map, but the base rules award no hider cards when the response time expires."
        />
      ) : null}

      {activeQuestion?.randomizedFromQuestionInstanceId ? (
        <StateBanner
          tone="info"
          title="Randomize used"
          detail={`The original clue was replaced with ${activeQuestionTemplate?.name ?? 'another question'} from the same category.`}
        />
      ) : null}

      {activeMatch && showGameContext ? (
        <Panel
          title="Match Timing"
          subtitle="Question flow follows the current hide timer, cooldown timer, pause state, and card lock."
        >
          <MatchTimingPanel model={timingModel} />
        </Panel>
      ) : null}

      {resolvedQuestion ? (
        <>
          <Panel
            title="Latest Result"
            subtitle="Review the most recent clue in plain language before you ask the next one or head back to the map."
            tone="soft"
          >
            <QuestionResolutionPanel
              title="Latest Question Outcome"
              question={resolvedQuestion}
              template={resolvedQuestionTemplate}
              category={resolvedQuestionCategory}
              constraint={resolvedQuestionConstraint}
              visibleMap={visibleMap}
              actionSlot={
                resolvedQuestion ? (
                  <AppButton
                    label="Open Map View"
                    tone="secondary"
                    onPress={() => {
                      router.push('/map');
                    }}
                  />
                ) : undefined
              }
            />
          </Panel>
        </>
      ) : null}

      {showQuestionPrepPanel ? (
        <Panel
          title="Match Controls"
          subtitle="Starting a round begins the hide timer. The hider must choose a station and confirm arrival before seeking starts."
        >
          <AppButton
            label={
              state.loadState === 'loading'
                ? 'Working...'
                : 'Start Hide Phase'
            }
            onPress={handlePrepareFlow}
            disabled={!canPrepareFlow || state.loadState === 'loading'}
          />
          <AppButton
            label="Refresh Question State"
            onPress={() => {
              void refreshActiveMatch();
            }}
            disabled={!activeMatch || state.loadState === 'loading'}
            tone="secondary"
          />
        </Panel>
      ) : null}

      <Panel
        title="Choose A Clue Type"
        subtitle="Pick from the printed investigation book. Card draw rules tell the hider what they earn after an answer."
      >
        <QuestionCategoryList
          categories={categoryViewModels}
          selectedCategoryId={selectedCategoryId}
          selectedScale={selectedScale}
          disabledCategoryId={projection?.disabledQuestionCategoryId}
          onSelect={setSelectedCategoryId}
        />
        {projection?.disabledQuestionCategoryId ? (
          <StateBanner
            tone="warning"
            title={`${findQuestionCategory(contentPack, projection.disabledQuestionCategoryId)?.name ?? 'A clue category'} is blocked`}
            detail="Curse of Spotty Memory rerolls the blocked category after the next accepted question."
          />
        ) : null}
      </Panel>

      <Panel
        title="Printed Rules"
        subtitle="Question availability follows the selected game scale. The draw and pick values are the hider's card reward."
        tone="soft"
      >
        {selectedCategory ? (
          <>
            <Text style={styles.title}>{selectedCategory.name}</Text>
            <Text style={styles.copy}>
              {describeQuestionCategoryForPlayers(selectedCategory)}
            </Text>
            <FactList
              items={[
                { label: 'Prompt', value: selectedCategory.promptTemplate },
                {
                  label: 'Hider card reward',
                  value: ruleLabel ?? 'Manual card reward'
                },
                {
                  label: 'Response limit',
                  value: timerLabel ?? 'Manual timer'
                },
                { label: 'Questions in this scale', value: availableTemplates.length }
              ]}
            />
            {selectedCategory.drawRule.pickCount > 1 ? (
              <Text style={styles.helper}>
                The hider draws {selectedCategory.drawRule.drawCount} cards and
                keeps {selectedCategory.drawRule.pickCount} after each answered
                question.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>
            Choose a category to load its workbook rule.
          </Text>
        )}
      </Panel>

      {isEndgameQuestionState ? (
        <StateBanner
          tone="warning"
          title="Endgame is live"
          detail="Keep asking questions. If a photo challenge requires the hider to leave their fixed final spot, they can record it as impossible and still receive the printed card reward."
        />
      ) : null}

      <Panel
        title="Investigation Book"
        subtitle="Questions remain available after being asked. Curse locks mark the exact prompts seekers cannot ask this run."
      >
        {selectedQuestionIsDisabled ? (
          <StateBanner
            tone="warning"
            title="This exact question is locked"
            detail="A hider's curse has blocked this prompt for the rest of the current run. Choose another question."
          />
        ) : null}
        {!selectedCategory ? (
          <Text style={styles.copy}>Choose a category first.</Text>
        ) : availableTemplates.length === 0 ? (
          <Text style={styles.copy}>
            This category has no imported templates for the current game size
            yet. Choose another clue type or change the match scale during
            setup.
          </Text>
        ) : (
          <>
            <FactList
              items={[
                {
                  label: 'Hider card reward',
                  value: ruleLabel ?? 'Manual draw rule'
                },
                { label: 'Timer', value: timerLabel ?? 'Manual timer' },
                { label: 'Questions available', value: availableQuestionLabel ?? 'Select a clue type' }
              ]}
            />
            {readyTemplates.length > 0 ? (
              <QuestionTemplateList
                templates={readyTemplates}
                category={selectedCategory}
                selectedTemplateId={selectedTemplateId}
                disabledTemplateIds={projection?.disabledQuestionTemplateIds}
                regionId={selectedRegionId}
                describeSupport={(template, category) =>
                  describeTemplateSupport({
                    template,
                    category,
                    regionId: selectedRegionId
                  })
                }
                onSelect={(templateId) => {
                  setSelectedTemplateId(templateId);
                }}
              />
            ) : (
              <Text style={styles.copy}>
                No imported questions are available for this game scale. Choose
                another clue type or update the content pack.
              </Text>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="Ask The Clue"
        subtitle="Review the selected clue in plain language, including how it should affect the search map."
        tone="accent"
      >
        {previewTemplate && selectedCategory ? (
          <>
            <Text style={styles.title}>{previewTemplate.name}</Text>
            <Text style={styles.copy}>
              You will ask:{' '}
              {isQuestionDistanceChoice(previewTemplate)
                ? describeQuestionTemplateForPlayers(previewTemplate, selectedCategory)
                    .replace('the chosen distance', parseChosenDistanceMeters(chosenDistanceDraft)
                      ? `${parseChosenDistanceMeters(chosenDistanceDraft)} meters`
                      : 'a distance you choose')
                : describeQuestionTemplateForPlayers(previewTemplate, selectedCategory)}
            </Text>
            {isQuestionDistanceChoice(previewTemplate) ? (
              <>
                <Field
                  label="Choose the Radar distance (meters)"
                  value={chosenDistanceDraft}
                  onChangeText={setChosenDistanceDraft}
                  placeholder="For example, 1500"
                  keyboardType="decimal-pad"
                />
                <Text style={styles.helper}>
                  The answer and map radius are calculated from this distance and the current player locations.
                </Text>
              </>
            ) : null}
            {selectedQuestionImpact ? (
              <StateBanner
                tone={selectedQuestionImpact.tone}
                title={selectedQuestionImpact.label}
                detail={selectedQuestionImpact.detail}
              />
            ) : null}
            {requiresTransitConfirmation ? (
              <>
                <StateBanner
                  tone="warning"
                  title="Only ask from moving transit"
                  detail="The hider should answer Yes only if the service you are riding will stop at their station. Passing through without stopping is No; screenshot the planned stops and send them to the hider."
                />
                <AppButton
                  label={confirmedMovingTransit ? 'Confirmed: seekers are riding moving transit' : 'Confirm seekers are riding moving transit'}
                  tone={confirmedMovingTransit ? 'primary' : 'secondary'}
                  onPress={() => setConfirmedMovingTransit(true)}
                />
              </>
            ) : null}
            <Text style={styles.helper}>
              Hider reward for this ask: {selectedRewardLabel}. Repeated
              questions pay this reward in separate draw and pick sets.
            </Text>
            <FactList
              items={[
                {
                  label: 'How to answer',
                  value: describeExpectedAnswerGuidance(previewTemplate, selectedCategory)
                },
                {
                  label: 'Best for',
                  value: formatQuestionScaleSet(
                    previewTemplate.scaleSet.appliesTo
                  )
                },
                {
                  label: 'How it behaves today',
                  value: describeTemplateSupport({
                    template: previewTemplate,
                    category: selectedCategory,
                    regionId: selectedRegionId
                  })
                }
              ]}
            />
            {previewFeatureData.length > 0 ? (
              <Text style={styles.copy}>
                This playable region already has place data for this clue, so
                the result can do more than just record evidence.
              </Text>
            ) : null}
            <AppButton
              label="Ask Selected Question"
              onPress={handleAskQuestion}
              disabled={!canAskQuestion || state.loadState === 'loading' || (requiresTransitConfirmation && !confirmedMovingTransit)}
            />
            {!canAskQuestion ? (
              <Text style={styles.helper}>
                This category is using the current authoritative workbook draw.
                When no clue is ready here, the match state still needs the next
                draw to open or the current clue step to finish.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>
            Choose a category with a ready workbook draw first.
          </Text>
        )}
      </Panel>

      <Panel
        title="Answer The Clue"
        subtitle="Respond from the hider or host view when the live match is waiting for an answer."
      >
        {activeQuestion && activeQuestionTemplate && activeQuestionCategory ? (
          <>
            <FactList
              items={[
                { label: 'Asked clue', value: activeQuestionTemplate.name },
                ...(activeQuestion?.chosenDistanceMeters
                  ? [{ label: 'Chosen distance', value: `${activeQuestion.chosenDistanceMeters} m` }]
                  : []),
                ...(activeQuestion.confirmedMovingTransit
                  ? [{ label: 'Transit rule', value: 'Seekers confirmed they are riding moving transit' }]
                  : []),
                {
                  label: 'Workbook timer',
                  value: formatTimerPolicyLabel(
                    activeQuestionCategory.defaultTimerPolicy,
                    selectedScale
                  )
                },
                {
                  label: 'Time left',
                  value:
                    activeQuestionTimerSeconds !== undefined
                      ? formatCountdown(activeQuestionTimerSeconds)
                      : 'Waiting for question timer'
                }
              ]}
            />
            {activeQuestionTimerSeconds !== undefined ? (
              <Text style={styles.helper}>
                This countdown comes from the live match timer for the active
                workbook question.
              </Text>
            ) : null}
            <QuestionAnswerComposer
              template={activeQuestionTemplate}
              category={activeQuestionCategory}
              draft={answerDraft}
              candidateFeatures={answerFeatureData}
              allowNullAnswer={activeQuestion.randomizedNullAnswerAllowed}
              disabled={!canAnswerQuestion || state.loadState === 'loading'}
              onChange={setAnswerDraft}
              onNullAnswer={handleNullQuestionAnswer}
            />
            {questionAttachmentContext ? (
              <EvidenceCapturePanel
                context={questionAttachmentContext}
                drafts={questionEvidenceDrafts}
                visibleAttachments={
                  activeQuestionEvidenceContext?.attachments ?? []
                }
                disabled={
                  !activeMatch ||
                  state.loadState === 'loading' ||
                  !canAnswerQuestion
                }
                busy={localMedia.isContextBusy(
                  questionAttachmentContext.contextId
                )}
                feedback={localMedia.getContextFeedback(
                  questionAttachmentContext.contextId
                )}
                localPreviewByAttachmentId={
                  localMedia.localPreviewByAttachmentId
                }
                submitLabel="Record Evidence In Match"
                submitDisabled={questionEvidenceDrafts.length === 0}
                submitHint={questionEvidenceHint}
                emptyVisibleText="No visible question evidence has been recorded yet."
                onChooseFromLibrary={() => {
                  void localMedia.chooseFromLibrary(questionAttachmentContext);
                }}
                onTakePhoto={() => {
                  void localMedia.takePhoto(questionAttachmentContext);
                }}
                onUpdateDraft={localMedia.updateDraft}
                onRemoveDraft={localMedia.removeDraft}
                onSubmitSelected={() => {
                  void handleRecordQuestionEvidence();
                }}
              />
            ) : null}
            {activeQuestionCategory?.resolverKind === 'photo_challenge' && !hasRequiredQuestionEvidence ? (
              <Text style={styles.copy}>
                Record public photo evidence for this question before submitting your answer.
              </Text>
            ) : null}
            <AppButton
              label="Submit Answer"
              onPress={handleAnswerQuestion}
              disabled={!canAnswerQuestion || !hasRequiredQuestionEvidence || state.loadState === 'loading'}
            />
            {activeQuestionCategory?.resolverKind === 'photo_challenge' ? (
              <AppButton
                label={isEndgameQuestionState
                  ? 'Impossible from the final spot — answer and earn reward'
                  : 'The subject is not in my hiding zone'}
                tone="secondary"
                onPress={isEndgameQuestionState ? handleCannotAnswerDuringEndgame : handlePhotoSubjectAbsent}
                disabled={!canAnswerQuestion || state.loadState === 'loading'}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>
            When a question is awaiting an answer, the hider or host-admin view
            can answer it here with the expected response format.
          </Text>
        )}
      </Panel>

      <Panel
        title="Update The Map"
        subtitle="The host applies the answer here, then confirms whether the map changed or the clue only recorded evidence."
      >
        {activeQuestion && activeQuestionTemplate && activeQuestionCategory ? (
          <>
            <Text style={styles.copy}>
              The host applies the answer here. If the result supports geometry,
              the bounded search area updates inside the active playable region.
              If not, the match records the clue honestly as evidence only.
            </Text>
            <AppButton
              label="Apply Result"
              onPress={handleResolveQuestion}
              disabled={!canResolveQuestion || state.loadState === 'loading'}
            />
            {activeQuestionConstraint ? (
              <QuestionResolutionPanel
                title="Current Active Resolution"
                question={activeQuestion}
                template={activeQuestionTemplate}
                category={activeQuestionCategory}
                constraint={activeQuestionConstraint}
                visibleMap={visibleMap}
              />
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>
            Resolution becomes available after an answer is submitted and the
            match enters the constraint-application step.
          </Text>
        )}
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  }
});
