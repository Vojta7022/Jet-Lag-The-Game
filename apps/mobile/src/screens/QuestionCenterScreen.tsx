import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { defaultContentPack } from '../runtime/default-content-pack.ts';
import { createUuid } from '../runtime/create-uuid.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
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
  chooseConstraintIdForQuestion,
  createInitialAnswerDraft,
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
  const { state, submitCommand, submitCommands, refreshActiveMatch } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
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
      subtitle="Choose a question, answer it in the right role, and review how each result narrows the active search area."
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
          title="Match Context"
          subtitle="Question permissions, stage, and map context for the current view."
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
              { label: 'Scope', value: activeMatch.recipient.scope }
            ]}
          />
          <Text style={styles.copy}>
            Asking is enabled for seeker and host-admin views. Answering is enabled for hider and host-admin views. Constraint application remains host-authoritative.
          </Text>
        </Panel>
      ) : null}

      {activeMatch && viewerRole === 'spectator' ? (
        <StateBanner
          tone="info"
          title="Read-only spectator view"
          detail="Spectators can browse categories, inspect answers, and review bounded map updates, but cannot ask, answer, or resolve questions."
        />
      ) : null}

      <Panel
        title="Question Actions"
        subtitle="Use these controls to prepare the match, refresh the view, or add movement context for distance-based questions."
      >
        <AppButton
          label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Questions'}
          onPress={handlePrepareFlow}
          disabled={!canPrepareFlow || state.loadState === 'loading'}
        />
        <AppButton
          label="Add Sample Movement"
          onPress={handleSeedMovement}
          disabled={!canSeedMovement || state.loadState === 'loading'}
          tone="secondary"
        />
        <AppButton
          label="Refresh Questions"
          onPress={() => {
            void refreshActiveMatch();
          }}
          disabled={!activeMatch || state.loadState === 'loading'}
          tone="secondary"
        />
      </Panel>

      <Panel
        title="Categories"
        subtitle="Browse the available question groups from the current content pack."
      >
        <QuestionCategoryList
          categories={categoryViewModels}
          selectedCategoryId={selectedCategoryId}
          onSelect={setSelectedCategoryId}
        />
      </Panel>

      <Panel
        title="Templates"
        subtitle="Choose a specific question inside the selected category."
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
        title="Ask Question"
        subtitle="Send the selected question into the live match flow."
      >
        {selectedTemplate && selectedCategory ? (
          <>
            <Text style={styles.title}>{selectedTemplate.name}</Text>
            <Text style={styles.copy}>
              {describeTemplateSupport({
                template: selectedTemplate,
                category: selectedCategory,
                regionId: selectedRegionId
              })}
            </Text>
            {previewFeatureData.length > 0 ? (
              <Text style={styles.copy}>
                Region feature support: {previewFeatureData.length} approximate feature records are available for this template in the selected region.
              </Text>
            ) : null}
            <AppButton
              label={isQuestionReadyState ? 'Open Prompt And Ask' : 'Ask Selected Template'}
              onPress={handleAskQuestion}
              disabled={!canAskQuestion || state.loadState === 'loading'}
            />
          </>
        ) : (
          <Text style={styles.copy}>Select a template first.</Text>
        )}
      </Panel>

      <Panel
        title="Answer Question"
        subtitle="Respond from the hider or host view when a question is waiting for an answer."
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
            <AppButton
              label="Submit Answer"
              onPress={handleAnswerQuestion}
              disabled={!canAnswerQuestion || state.loadState === 'loading'}
            />
          </>
        ) : (
          <Text style={styles.copy}>
            When a question is awaiting an answer, the hider or host-admin view can answer it here.
          </Text>
        )}
      </Panel>

      <Panel
        title="Resolve Result"
        subtitle="Apply the canonical constraint and update the bounded candidate area."
      >
        {activeQuestion && activeQuestionTemplate && activeQuestionCategory ? (
          <>
            <Text style={styles.copy}>
              Host-admin resolution uses the selected template's canonical constraint mapping and refreshes the authoritative bounded candidate area.
            </Text>
            <AppButton
              label="Apply Constraint"
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
            Resolution becomes available after an answer is submitted and the match enters constraint application.
          </Text>
        )}
      </Panel>

      <Panel
        title="Latest Result"
        subtitle="Review the most recent resolved question and its effect on the map."
      >
        <QuestionResolutionPanel
          title="Resolved Question Summary"
          question={resolvedQuestion}
          template={resolvedQuestionTemplate}
          category={resolvedQuestionCategory}
          constraint={resolvedQuestionConstraint}
          visibleMap={visibleMap}
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
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  }
});
