import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
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
  formatQuestionScaleSet,
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

export function QuestionCenterScreen() {
  const { state, submitCommand, submitCommands, refreshActiveMatch, prepareAttachmentUploadCommands } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
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
  const availableTemplates = categoryViewModels.find(
    (entry) => entry.category.categoryId === selectedCategoryId
  )?.templates ?? [];
  const selectedTemplate = findQuestionTemplate(defaultContentPack, selectedTemplateId);
  const [answerDraft, setAnswerDraft] = useState<QuestionAnswerDraft>(() =>
    createInitialAnswerDraft(selectedTemplate)
  );

  useEffect(() => {
    if (!selectedCategoryId && categoryViewModels[0]) {
      setSelectedCategoryId(categoryViewModels[0].category.categoryId);
    }
  }, [categoryViewModels, selectedCategoryId]);

  useEffect(() => {
    if (!availableTemplates.some((template) => template.templateId === selectedTemplateId)) {
      setSelectedTemplateId(availableTemplates[0]?.templateId);
    }
  }, [availableTemplates, selectedTemplateId]);

  useEffect(() => {
    const composerTemplate = activeQuestion?.status === 'awaiting_answer'
      ? activeQuestionTemplate
      : selectedTemplate;
    setAnswerDraft(createInitialAnswerDraft(composerTemplate));
  }, [activeQuestion?.questionInstanceId, activeQuestion?.status, activeQuestionTemplate, selectedTemplate]);

  const visibleMap = projection?.visibleMap;
  const selectedRegionId = visibleMap?.regionId;
  const selectedQuestionImpact = selectedTemplate && selectedCategory
    ? describeQuestionImpactExpectation({
        template: selectedTemplate,
        category: selectedCategory,
        regionId: selectedRegionId
      })
    : undefined;
  const previewFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (selectedTemplate?.featureClassRefs ?? []).map((feature) => feature.featureClassId)
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
      selectedTemplate &&
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
    if (!selectedTemplate || !projection) {
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
        templateId: selectedTemplate.templateId,
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
      title="Question Center"
      subtitle="Choose a clue, answer it in the right role, and review exactly how the result did or did not change the active search area."
      topSlot={<ProductNavBar current="questions" />}
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
          title="Question context"
          subtitle="Who can act, what stage the match is in, and which playable region is currently active."
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
              { label: 'Playable Region', value: visibleMap?.displayName ?? 'Not selected yet' },
              { label: 'Scope', value: activeMatch.recipient.scope },
              { label: 'State Update', value: timingModel?.freshnessLabel ?? 'Waiting for live state' }
            ]}
          />
          <Text style={styles.copy}>
            Seekers and host-admin views can ask. Hiders and host-admin views can answer. Applying the final result remains host-authoritative so the map stays trustworthy.
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

      <Panel
        title="Match prep"
        subtitle="Get the question loop ready, refresh state, or add movement context for thermometer-style clues."
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

      <Panel
        title="Pick a clue type"
        subtitle="Start with the kind of answer you want back from the other side."
      >
        <QuestionCategoryList
          categories={categoryViewModels}
          selectedCategoryId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      </Panel>

      <Panel
        title="Choose a question"
        subtitle="Each question card tells you what it asks, how it should be answered, and how much map change to expect."
      >
        {selectedCategory ? (
          <QuestionTemplateList
            templates={availableTemplates}
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
            onSelect={setSelectedTemplateId}
          />
        ) : (
          <Text style={styles.copy}>Choose a category to browse question templates.</Text>
        )}
      </Panel>

      <Panel
        title="Before you ask"
        subtitle="Review the player-facing wording, expected answer format, and likely map effect."
      >
        {selectedTemplate && selectedCategory ? (
          <>
            <Text style={styles.title}>{selectedTemplate.name}</Text>
            <Text style={styles.copy}>
              {describeQuestionCategoryForPlayers(selectedCategory)}
            </Text>
            <Text style={styles.copy}>
              {describeQuestionTemplateForPlayers(selectedTemplate, selectedCategory)}
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
                { label: 'How to answer', value: describeExpectedAnswerGuidance(selectedTemplate) },
                { label: 'Scale fit', value: formatQuestionScaleSet(selectedTemplate.scaleSet.appliesTo) },
                {
                  label: 'Coverage today',
                  value: describeTemplateSupport({
                    template: selectedTemplate,
                    category: selectedCategory,
                    regionId: selectedRegionId
                  })
                }
              ]}
            />
            {previewFeatureData.length > 0 ? (
              <Text style={styles.copy}>
                Region feature support: {previewFeatureData.length} approximate feature records are available for this question in the current playable region.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.copy}>Choose a category and question card to see a plain-language briefing here.</Text>
        )}
      </Panel>

      <Panel
        title="Send this question"
        subtitle="Ask the selected clue when the current match state allows it."
      >
        {selectedTemplate && selectedCategory ? (
          <>
            <AppButton
              label="Ask Question"
              onPress={handleAskQuestion}
              disabled={!canAskQuestion || state.loadState === 'loading'}
            />
          </>
        ) : (
          <Text style={styles.copy}>Select a question card first.</Text>
        )}
      </Panel>

      <Panel
        title="Answer honestly"
        subtitle="Respond from the hider or host-admin view when the live match is waiting for an answer."
      >
        {activeQuestion && activeQuestionTemplate && activeQuestionCategory ? (
          <>
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
        title="Apply the outcome"
        subtitle="Host-admin applies the answer here, then confirms whether the map changed or the result only recorded evidence."
      >
        {activeQuestion && activeQuestionTemplate && activeQuestionCategory ? (
          <>
            <Text style={styles.copy}>
              Host-admin resolution uses the selected template's canonical mapping and refreshes the bounded search area inside the active playable region when the result supports geometry.
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
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  }
});
