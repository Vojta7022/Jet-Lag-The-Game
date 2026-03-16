import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
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
  buildDemoMovementCommands,
  buildQuestionCategoryViewModels,
  buildQuestionFlowBootstrapCommands,
  describeExpectedAnswerGuidance,
  describeQuestionCategoryForPlayers,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  canAskPreparedQuestion,
  consumePreparedQuestionTemplate,
  createQuestionSelectionRound,
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
  resolveTimerPolicyDurationSeconds,
  toggleKeptQuestionTemplate,
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

export function QuestionCenterScreen() {
  const { state, submitCommand, submitCommands, refreshActiveMatch, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
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
  const [selectionRounds, setSelectionRounds] = useState<Record<string, ReturnType<typeof createQuestionSelectionRound>>>({});
  const selectedTemplate = findQuestionTemplate(defaultContentPack, selectedTemplateId);
  const [answerDraft, setAnswerDraft] = useState<QuestionAnswerDraft>(() =>
    createInitialAnswerDraft(selectedTemplate)
  );
  const activeSelectionRound = selectedCategoryId ? selectionRounds[selectedCategoryId] : undefined;
  const drawnTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.drawnTemplateIds.includes(template.templateId)
  );
  const keptTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.keptTemplateIds.includes(template.templateId)
  );
  const readyTemplate = keptTemplates.find((template) => template.templateId === selectedTemplateId)
    ?? keptTemplates[0]
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
    const selectableTemplateIds = [
      ...(activeSelectionRound?.keptTemplateIds ?? []),
      ...(activeSelectionRound?.drawnTemplateIds ?? [])
    ];
    if (
      !selectedTemplateId ||
      (selectableTemplateIds.length > 0 && !selectableTemplateIds.includes(selectedTemplateId)) ||
      (selectableTemplateIds.length === 0 && !availableTemplates.some((template) => template.templateId === selectedTemplateId))
    ) {
      setSelectedTemplateId(
        activeSelectionRound?.keptTemplateIds[0] ??
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
  const [questionNowMs, setQuestionNowMs] = useState(() => Date.now());
  const canPrepareFlow = Boolean(
    activeMatch &&
      capabilities.canPrepareFlow &&
      projection &&
      ['draft', 'lobby', 'role_assignment', 'rules_confirmation', 'map_setup', 'hide_phase'].includes(
        projection.lifecycleState
      )
  );
  const canSeedMovement = Boolean(
    activeMatch &&
      capabilities.canSeedMovement &&
      visibleMap?.playableBoundary.geometry &&
      (
        projection?.lifecycleState === 'hide_phase' ||
        (projection?.lifecycleState === 'seek_phase' &&
          (projection.seekPhaseSubstate === 'ready' || projection.seekPhaseSubstate === 'cooldown')) ||
        projection?.lifecycleState === 'endgame'
      )
  );
  const canAskQuestion = Boolean(
    activeMatch &&
      capabilities.canAskQuestions &&
      readyTemplate &&
      canAskPreparedQuestion(activeSelectionRound, selectedCategory) &&
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
  const showQuestionPrepPanel = canPrepareFlow || canSeedMovement;
  const activeQuestionTimerSeconds = activeQuestionCategory
    ? resolveTimerPolicyDurationSeconds(activeQuestionCategory.defaultTimerPolicy, selectedScale)
    : undefined;

  useEffect(() => {
    if (!isAwaitingAnswer || activeQuestionTimerSeconds === undefined) {
      setQuestionNowMs(Date.now());
      return undefined;
    }

    const intervalId = setInterval(() => {
      setQuestionNowMs(Date.now());
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [activeQuestion?.questionInstanceId, activeQuestionTimerSeconds, isAwaitingAnswer]);

  const activeQuestionRemainingSeconds =
    activeQuestionTimerSeconds !== undefined && activeQuestion?.askedAt
      ? Math.max(0, activeQuestionTimerSeconds - Math.floor((questionNowMs - Date.parse(activeQuestion.askedAt)) / 1000))
      : undefined;
  const keptSelectionLabel = selectedCategory
    ? `${keptTemplates.length} of ${selectedCategory.drawRule.pickCount} kept`
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

  const handleSeedMovement = () => {
    const commands = buildDemoMovementCommands(visibleMap?.playableBoundary.geometry);
    if (commands.length === 0) {
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

    void submitCommands(commands).then((accepted) => {
      if (!accepted || !selectedCategoryId) {
        return;
      }

      setSelectionRounds((current) => {
        const round = current[selectedCategoryId];
        const consumed = consumePreparedQuestionTemplate(round, readyTemplate.templateId);

        return {
          ...current,
          [selectedCategoryId]: consumed ?? round
        };
      });
    });
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
      title="Questions"
      subtitle={
        liveGameplayState
          ? 'Draw clue cards from the workbook rules, ask the next question, and see clearly what changed on the map.'
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
        title="Question Context"
        subtitle="See who can act right now, which workbook scale is active, and what the next question should accomplish."
      >
        <FactList
          items={[
            { label: 'Your Role', value: formatRoleLabel(viewerRole) },
            {
              label: 'Current Phase',
                value: formatPhaseLabel(projection?.lifecycleState, projection?.seekPhaseSubstate)
            },
            { label: 'Search Map', value: visibleMap?.displayName ?? 'Not selected yet' },
            { label: 'Game Size', value: selectedScale ? formatQuestionScaleSet([selectedScale]) : 'Waiting for setup' },
            { label: 'Live Update', value: timingModel?.freshnessLabel ?? 'Waiting for live state' }
          ]}
        />
        <Text style={styles.copy}>
          Seekers and host views can ask. Hiders and host views can answer. Host views still apply the final bounded map result so everyone can trust the search area.
        </Text>
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
        subtitle="Review the most recent question in plain language before you ask the next one."
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
          subtitle="Use these only when the match still needs setup or when thermometer clues need movement history."
        >
          <AppButton
            label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Questions'}
            onPress={handlePrepareFlow}
            disabled={!canPrepareFlow || state.loadState === 'loading'}
          />
          <AppButton
            label="Add Seeker Movement Trail"
            onPress={handleSeedMovement}
            disabled={!canSeedMovement || state.loadState === 'loading'}
            tone="secondary"
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
                This category keeps multiple clue cards. Draw a set, keep {selectedCategory.drawRule.pickCount}, then ask them one at a time as the match opens question windows.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>Choose a category to load its workbook rule.</Text>
        )}
      </Panel>

      <Panel
        title="Drawn Question Cards"
        subtitle="Draw a clue set from the active category, then keep the allowed number before you ask."
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
                { label: 'Current draw', value: activeSelectionRound ? `Round ${activeSelectionRound.round}` : 'No draw yet' },
                { label: 'Kept cards', value: keptSelectionLabel ?? 'No kept cards yet' }
              ]}
            />
            <AppButton
              label={activeSelectionRound ? 'Draw A New Set' : 'Draw Question Cards'}
              onPress={() => {
                if (!selectedCategory || !selectedCategoryId) {
                  return;
                }

                const nextRound = createQuestionSelectionRound({
                  category: selectedCategory,
                  templates: availableTemplates,
                  selectedScale,
                  previousRound: activeSelectionRound
                });
                setSelectionRounds((current) => ({
                  ...current,
                  [selectedCategoryId]: nextRound
                }));
                setSelectedTemplateId(nextRound.keptTemplateIds[0] ?? nextRound.drawnTemplateIds[0]);
              }}
              disabled={!capabilities.canAskQuestions || state.loadState === 'loading'}
            />
            {drawnTemplates.length > 0 ? (
              <QuestionTemplateList
                templates={drawnTemplates}
                category={selectedCategory}
                selectedTemplateId={selectedTemplateId}
                selectedTemplateIds={activeSelectionRound?.keptTemplateIds}
                selectionLimit={selectedCategory.drawRule.pickCount}
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
                  if (!activeSelectionRound) {
                    return;
                  }

                  setSelectionRounds((current) => ({
                    ...current,
                    [selectedCategory.categoryId]: toggleKeptQuestionTemplate(
                      current[selectedCategory.categoryId] ?? activeSelectionRound,
                      templateId,
                      selectedCategory.drawRule.pickCount
                    )
                  }));
                }}
              />
            ) : (
              <Text style={styles.copy}>Draw a set of clue cards to start this category.</Text>
            )}
          </>
        )}
      </Panel>

      <Panel
        title="Before You Ask"
        subtitle="Review the selected clue in plain language, including how it should change the search map."
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
            {!canAskPreparedQuestion(activeSelectionRound, selectedCategory) ? (
              <Text style={styles.helper}>
                Keep {selectedCategory.drawRule.pickCount} clue {selectedCategory.drawRule.pickCount === 1 ? 'card' : 'cards'} from the current draw before asking.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>Draw a clue set and keep the allowed number of question cards first.</Text>
        )}
      </Panel>

      <Panel
        title="Answer Honestly"
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
                  value: activeQuestionRemainingSeconds !== undefined
                    ? formatCountdown(activeQuestionRemainingSeconds)
                    : 'Waiting for question timer'
                }
              ]}
            />
            {activeQuestionRemainingSeconds !== undefined ? (
              <Text style={styles.helper}>
                This countdown follows the workbook response limit in the current app shell. Final enforcement is still a live match responsibility.
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
        title="Apply The Outcome"
        subtitle="The host applies the answer here, then confirms whether the map changed or the result only recorded evidence."
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
