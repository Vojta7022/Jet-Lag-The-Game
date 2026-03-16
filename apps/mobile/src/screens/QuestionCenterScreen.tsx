import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { buildQuestionSelectionState } from '../../../../packages/domain/src/index.ts';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
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
  buildConstraintResolutionMetadata,
  buildQuestionCategoryViewModels,
  buildQuestionFlowBootstrapCommands,
  describeExpectedAnswerGuidance,
  describeQuestionCategoryForPlayers,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  filterTemplatesForScale,
  formatQuestionScaleSet,
  formatQuestionDrawRule,
  formatTimerPolicyLabel,
  buildQuestionMapEffectModel,
  chooseConstraintIdForQuestion,
  createInitialAnswerDraft,
  appendAttachmentIdToDraft,
  describeTemplateSupport,
  findActiveQuestion,
  findConstraintForQuestion,
  findLatestResolvedQuestion,
  findQuestionCategory,
  findQuestionTemplate,
  getQuestionFlowCapabilities,
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
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function resolveCurrentRole(role: string | undefined, scope: string | undefined) {
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
  return role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatPhaseLabel(lifecycleState: string | undefined, seekPhaseSubstate: string | undefined) {
  if (!lifecycleState) {
    return 'Unavailable';
  }

  const lifecycleLabel = lifecycleState.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  if (!seekPhaseSubstate) {
    return lifecycleLabel;
  }

  const substateLabel = seekPhaseSubstate.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
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

  if (lifecycleState === 'endgame') {
    return 'Finish the last live clues';
  }

  if (lifecycleState === 'game_complete') {
    return 'Match complete';
  }

  if (lifecycleState !== 'seek_phase') {
    return formatPhaseLabel(lifecycleState, seekPhaseSubstate);
  }

  switch (seekPhaseSubstate) {
    case 'ready':
      return 'Ask the next clue';
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
  const { state, submitCommand, submitCommands, refreshActiveMatch, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const capabilities = getQuestionFlowCapabilities(viewerRole);
  const categoryViewModels = useMemo(
    () => buildQuestionCategoryViewModels(defaultContentPack),
    []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | undefined>(
    categoryViewModels[0]?.category.categoryId
  );
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(
    categoryViewModels[0]?.templates[0]?.templateId
  );
  const activeQuestion = findActiveQuestion(projection);
  const resolvedQuestion = findLatestResolvedQuestion(projection);
  const activeQuestionTemplate = findQuestionTemplate(defaultContentPack, activeQuestion?.templateId);
  const activeQuestionCategory = findQuestionCategory(defaultContentPack, activeQuestion?.categoryId);
  const resolvedQuestionTemplate = findQuestionTemplate(defaultContentPack, resolvedQuestion?.templateId);
  const resolvedQuestionCategory = findQuestionCategory(defaultContentPack, resolvedQuestion?.categoryId);
  const selectedCategory = findQuestionCategory(defaultContentPack, selectedCategoryId);
  const availableTemplates = filterTemplatesForScale(
    categoryViewModels.find((entry) => entry.category.categoryId === selectedCategoryId)?.templates ?? [],
    selectedScale
  );
  const selectedTemplate = findQuestionTemplate(defaultContentPack, selectedTemplateId);
  const [answerDraft, setAnswerDraft] = useState<QuestionAnswerDraft>(() =>
    createInitialAnswerDraft(selectedTemplate)
  );
  const activeSelectionRound = useMemo(
    () =>
      selectedCategory
        ? buildQuestionSelectionState({
            contentPack: defaultContentPack,
            category: selectedCategory,
            selectedScale,
            askedQuestions: (projection?.visibleQuestions ?? []).map((question) => ({
              templateId: question.templateId,
              categoryId: question.categoryId,
              askedAt: question.askedAt
            }))
          })
        : undefined,
    [projection?.visibleQuestions, selectedCategory, selectedScale]
  );
  const drawnTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.drawnTemplateIds.includes(template.templateId)
  );
  const readyTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.availableTemplateIds.includes(template.templateId)
  );
  const readyTemplate = readyTemplates.find((template) => template.templateId === selectedTemplateId)
    ?? readyTemplates[0]
    ?? drawnTemplates.find((template) => template.templateId === selectedTemplateId)
    ?? drawnTemplates[0];
  const previewTemplate = readyTemplate ?? selectedTemplate;
  const ruleLabel = selectedCategory ? formatQuestionDrawRule(selectedCategory) : undefined;
  const timerLabel = selectedCategory
    ? formatTimerPolicyLabel(selectedCategory.defaultTimerPolicy, selectedScale)
    : undefined;

  useEffect(() => {
    if (!selectedCategoryId && categoryViewModels[0]) {
      setSelectedCategoryId(categoryViewModels[0].category.categoryId);
    }
  }, [categoryViewModels, selectedCategoryId]);

  useEffect(() => {
    const selectableTemplateIds = activeSelectionRound?.availableTemplateIds ?? [];
    if (
      !selectedTemplateId ||
      (selectableTemplateIds.length > 0 && !selectableTemplateIds.includes(selectedTemplateId)) ||
      (selectableTemplateIds.length === 0 && !availableTemplates.some((template) => template.templateId === selectedTemplateId))
    ) {
      setSelectedTemplateId(
        activeSelectionRound?.availableTemplateIds[0] ??
        activeSelectionRound?.drawnTemplateIds[0] ??
        availableTemplates[0]?.templateId
      );
    }
  }, [activeSelectionRound, availableTemplates, selectedTemplateId]);

  useEffect(() => {
    const composerTemplate = activeQuestion?.status === 'awaiting_answer'
      ? activeQuestionTemplate
      : readyTemplate;
    setAnswerDraft(createInitialAnswerDraft(composerTemplate));
  }, [activeQuestion?.questionInstanceId, activeQuestion?.status, activeQuestionTemplate, readyTemplate]);

  const visibleMap = projection?.visibleMap;
  const selectedRegionId = visibleMap?.regionId;
  const selectedQuestionImpact = previewTemplate && selectedCategory
    ? describeQuestionImpactExpectation({
        template: previewTemplate,
        category: selectedCategory,
        regionId: selectedRegionId
      })
    : undefined;
  const previewFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (previewTemplate?.featureClassRefs ?? []).map((feature) => feature.featureClassId)
  );
  const answerFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (activeQuestionTemplate?.featureClassRefs ?? []).map((feature) => feature.featureClassId)
  );
  const activeQuestionConstraint = findConstraintForQuestion(projection, activeQuestion?.questionInstanceId);
  const resolvedQuestionConstraint = findConstraintForQuestion(projection, resolvedQuestion?.questionInstanceId);
  const evidenceContexts = useMemo(
    () => buildEvidenceContexts(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const activeQuestionEvidenceContext = evidenceContexts.find((context) => context.kind === 'question');
  const questionAttachmentContext = useMemo<LocalEvidenceContextDescriptor | undefined>(
    () =>
      activeQuestionEvidenceContext
        ? {
            contextId: activeQuestionEvidenceContext.contextId,
            kind: 'question',
            title: activeQuestionEvidenceContext.title,
            detail: activeQuestionEvidenceContext.detail,
            visibilityScope: activeQuestionEvidenceContext.suggestedVisibilityScope,
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
    state.lastSync?.eventStream.events.some((eventFrame) => eventFrame.type === 'constraint_applied') &&
      latestResolvedEffect
  );
  const isQuestionReadyState = projection?.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'ready';
  const isQuestionSelectionState =
    projection?.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'awaiting_question_selection';
  const isAwaitingAnswer =
    projection?.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'awaiting_question_answer';
  const isApplyingConstraints =
    projection?.lifecycleState === 'seek_phase' && projection.seekPhaseSubstate === 'applying_constraints';
  const canPrepareFlow = Boolean(
    activeMatch &&
      capabilities.canPrepareFlow &&
      projection &&
      ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup'].includes(
        projection.lifecycleState
      )
  );
  const canAskQuestion = Boolean(
    activeMatch &&
      capabilities.canAskQuestions &&
      readyTemplate &&
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
  const questionEvidenceHint = activeMatch?.onlineStatus?.attachmentStorageMode === 'durable_supabase_storage'
    ? 'Recording evidence here uploads the image to Supabase Storage and records durable attachment metadata in the match.'
    : activeMatch?.runtimeKind === 'online_foundation'
      ? 'Recording evidence here creates real attachment records through the runtime, but this online session is still falling back to metadata-only storage.'
      : 'Recording evidence here creates real attachment records through the runtime. The file preview stays local to this device session until fuller storage support is added.';
  const showQuestionPrepPanel = !liveGameplayState && canPrepareFlow;
  const activeQuestionTimerSeconds = timingModel?.timers.find(
    (timer) => timer.kind === 'question' && timer.status !== 'completed'
  )?.remainingSeconds;
  const keptSelectionLabel = selectedCategory && activeSelectionRound
    ? `${activeSelectionRound.availableTemplateIds.length} ready from ${activeSelectionRound.drawnTemplateIds.length} drawn`
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

    const commands = [];
    if (isQuestionReadyState) {
      commands.push({
        type: 'begin_question_prompt' as const,
        payload: {}
      });
    }

    commands.push({
      type: 'ask_question' as const,
      payload: {
        questionInstanceId: `question:${createUuid()}`,
        templateId: readyTemplate.templateId,
        targetTeamId: projection.teams.find((team) => team.side === 'hider')?.teamId ?? 'team-hider'
      }
    });

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

  const handleRecordQuestionEvidence = async () => {
    if (!questionAttachmentContext) {
      return;
    }

    const attachmentIds = questionEvidenceDrafts.map((draft) => draft.attachmentId);
    const commands = await prepareAttachmentUploadCommands(questionEvidenceDrafts);
    if (!commands || commands.length === 0) {
      return;
    }

    localMedia.markSubmitting(attachmentIds);
    const succeeded = await submitCommands(commands);
    if (succeeded) {
      localMedia.markSubmitted(attachmentIds);
      setAnswerDraft((current) =>
        attachmentIds.reduce(
          (draft, attachmentId) => appendAttachmentIdToDraft(draft, attachmentId),
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
          contentPack: defaultContentPack,
          visibleMap,
          template: activeQuestionTemplate,
          question: activeQuestion
        })
      }
    });
  };

  return (
    <ScreenContainer
      title={liveGameplayState ? 'Clue Review' : 'Questions'}
      eyebrow={liveGameplayState ? 'Live Game' : 'Support'}
      subtitle={
        liveGameplayState
          ? 'Use this as the full clue review screen when you need more detail than the live map flow.'
          : 'Prepare the next clue, answer it honestly, and see clearly whether the map changed or the result stayed as evidence only.'
      }
      topSlot={liveGameplayState ? undefined : <ProductNavBar current="questions" />}
      bottomSlot={liveGameplayState ? <GameplayTabBar current="questions" /> : undefined}
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Question flows only run through an active runtime connection."
        />
      ) : null}

      {activeMatch ? (
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
              value: describeQuestionFlowStep(projection?.lifecycleState, projection?.seekPhaseSubstate)
            },
            { label: 'Game Map', value: visibleMap?.displayName ?? 'Not selected yet' },
            { label: 'Game Size', value: selectedScale ? formatQuestionScaleSet([selectedScale]) : 'Waiting for setup' },
            { label: 'Live Update', value: timingModel?.freshnessLabel ?? 'Waiting for live state' }
          ]}
        />
        <Text style={styles.copy}>
          Seekers ask from the current workbook draw, hiders answer honestly, and the host applies the bounded result so everyone can trust the map.
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

      {latestConstraintApplied && latestResolvedEffect ? (
        <StateBanner
          tone={latestResolvedEffect.mapEffectTone}
          title={latestResolvedEffect.mapEffectTitle}
          detail={latestResolvedEffect.mapEffectDetail}
        />
      ) : null}

      {activeMatch ? (
        <Panel
          title="Match Timing"
          subtitle="Question flow follows the current hide timer, cooldown timer, pause state, and card lock."
        >
          <MatchTimingPanel model={timingModel} />
        </Panel>
      ) : null}

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

      {showQuestionPrepPanel ? (
        <Panel
          title="Match Controls"
          subtitle="Use this only while the match is still being prepared for the live clue loop."
        >
          <AppButton
            label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Questions'}
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
        subtitle="Start with the kind of clue you want, then follow the workbook draw and keep rule for that category."
      >
        <QuestionCategoryList
          categories={categoryViewModels}
          selectedCategoryId={selectedCategoryId}
          selectedScale={selectedScale}
          onSelect={setSelectedCategoryId}
        />
      </Panel>

      <Panel
        title="Workbook Rule"
        subtitle="This is the real draw, keep, and answer window rule imported from the workbook."
        tone="soft"
      >
        {selectedCategory ? (
          <>
            <Text style={styles.title}>{selectedCategory.name}</Text>
            <Text style={styles.copy}>{describeQuestionCategoryForPlayers(selectedCategory)}</Text>
            <FactList
              items={[
                { label: 'Prompt', value: selectedCategory.promptTemplate },
                { label: 'Draw / Keep', value: ruleLabel ?? 'Manual draw rule' },
                { label: 'Response limit', value: timerLabel ?? 'Manual timer' },
                { label: 'Templates in play', value: availableTemplates.length }
              ]}
            />
            {selectedCategory.drawRule.pickCount > 1 ? (
              <Text style={styles.helper}>
                This category can use multiple clue cards from the same workbook draw. Ask up to {selectedCategory.drawRule.pickCount} before the next draw rotates in.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>Choose a category to load its workbook rule.</Text>
        )}
      </Panel>

      <Panel
        title="Current Draw"
        subtitle="This draw is authoritative for the current match state, so every device sees the same live workbook options."
      >
        {!selectedCategory ? (
          <Text style={styles.copy}>Choose a category first.</Text>
        ) : availableTemplates.length === 0 ? (
          <Text style={styles.copy}>
            This category has no imported templates for the current game size yet. Choose another clue type or change the match scale during setup.
          </Text>
        ) : (
          <>
            <FactList
              items={[
                { label: 'Workbook rule', value: ruleLabel ?? 'Manual draw rule' },
                { label: 'Timer', value: timerLabel ?? 'Manual timer' },
                { label: 'Current draw', value: activeSelectionRound ? `Round ${activeSelectionRound.round}` : 'Not available yet' },
                { label: 'Ready now', value: keptSelectionLabel ?? 'No ready cards yet' }
              ]}
            />
            {readyTemplates.length > 0 ? (
              <QuestionTemplateList
                templates={readyTemplates}
                category={selectedCategory}
                selectedTemplateId={selectedTemplateId}
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
                No question cards are currently ready from this workbook draw. Finish the current clue window or wait for the next authoritative draw to open.
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
              You will ask: {describeQuestionTemplateForPlayers(previewTemplate, selectedCategory)}
            </Text>
            {selectedQuestionImpact ? (
              <StateBanner
                tone={selectedQuestionImpact.tone}
                title={selectedQuestionImpact.label}
                detail={selectedQuestionImpact.detail}
              />
            ) : null}
            <FactList
              items={[
                { label: 'How to answer', value: describeExpectedAnswerGuidance(previewTemplate) },
                { label: 'Best for', value: formatQuestionScaleSet(previewTemplate.scaleSet.appliesTo) },
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
                This playable region already has place data for this clue, so the result can do more than just record evidence.
              </Text>
            ) : null}
            <AppButton
              label="Ask Selected Question"
              onPress={handleAskQuestion}
              disabled={!canAskQuestion || state.loadState === 'loading'}
            />
            {!canAskQuestion ? (
              <Text style={styles.helper}>
                This category is using the current authoritative workbook draw. When no clue is ready here, the match state still needs the next draw to open or the current clue step to finish.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>Choose a category with a ready workbook draw first.</Text>
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
                { label: 'Workbook timer', value: formatTimerPolicyLabel(activeQuestionCategory.defaultTimerPolicy, selectedScale) },
                {
                  label: 'Time left',
                  value: activeQuestionTimerSeconds !== undefined
                    ? formatCountdown(activeQuestionTimerSeconds)
                    : 'Waiting for question timer'
                }
              ]}
            />
            {activeQuestionTimerSeconds !== undefined ? (
              <Text style={styles.helper}>
                This countdown comes from the live match timer for the active workbook question.
              </Text>
            ) : null}
            <QuestionAnswerComposer
              template={activeQuestionTemplate}
              category={activeQuestionCategory}
              draft={answerDraft}
              candidateFeatures={answerFeatureData}
              disabled={!canAnswerQuestion || state.loadState === 'loading'}
              onChange={setAnswerDraft}
            />
            {questionAttachmentContext ? (
              <EvidenceCapturePanel
                context={questionAttachmentContext}
                drafts={questionEvidenceDrafts}
                visibleAttachments={activeQuestionEvidenceContext?.attachments ?? []}
                disabled={!activeMatch || state.loadState === 'loading' || !canAnswerQuestion}
                busy={localMedia.isContextBusy(questionAttachmentContext.contextId)}
                feedback={localMedia.getContextFeedback(questionAttachmentContext.contextId)}
                localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
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
            <AppButton
              label="Submit Answer"
              onPress={handleAnswerQuestion}
              disabled={!canAnswerQuestion || state.loadState === 'loading'}
            />
          </>
        ) : (
          <Text style={styles.copy}>
            When a question is awaiting an answer, the hider or host-admin view can answer it here with the expected response format.
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
              The host applies the answer here. If the result supports geometry, the bounded search area updates inside the active playable region. If not, the match records the clue honestly as evidence only.
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
            Resolution becomes available after an answer is submitted and the match enters the constraint-application step.
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
