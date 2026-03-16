import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { buildQuestionSelectionState } from '../../../../../packages/domain/src/index.ts';

import { defaultContentPack } from '../../runtime/default-content-pack.ts';
import { createUuid } from '../../runtime/create-uuid.ts';
import { useAppShell } from '../../providers/AppShellProvider.tsx';
import {
  buildCardBehaviorModel,
  buildDeckViewModels,
  buildQuestionResponseCardReason,
  canResolveCardWindow,
  CardResolutionStatusPanel,
  CardZoneSection,
  HIDER_HAND_TARGET,
  resolveCurrentRole
} from '../cards/index.ts';
import {
  buildEvidenceContexts,
  EvidenceCapturePanel,
  useLocalMediaAttachments,
  type LocalEvidenceContextDescriptor
} from '../evidence/index.ts';
import {
  appendAttachmentIdToDraft,
  buildAnswerPayload,
  buildQuestionCategoryViewModels,
  buildConstraintResolutionMetadata,
  chooseConstraintIdForQuestion,
  createInitialAnswerDraft,
  describeExpectedAnswerGuidance,
  describeQuestionCategoryForPlayers,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  describeTemplateSupport,
  filterTemplatesForScale,
  findActiveQuestion,
  findConstraintForQuestion,
  findQuestionCategory,
  findQuestionTemplate,
  formatQuestionDrawRule,
  formatQuestionScaleSet,
  formatTimerPolicyLabel,
  getQuestionFlowCapabilities,
  getSeedRegionFeatureData,
  QuestionAnswerComposer,
  QuestionCategoryList,
  QuestionResolutionPanel,
  QuestionTemplateList,
  type QuestionAnswerDraft
} from '../questions/index.ts';
import { formatCountdown, useMatchTimingModel } from '../timers/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { StateBanner } from '../../ui/StateBanner.tsx';
import { colors } from '../../ui/theme.ts';

import { LiveMapInfoChips } from './LiveMapInfoChips.tsx';
import { resolveInlineLiveMapActionMode } from './live-map-action-flow-model.ts';

export function LiveMapInlineActionPanel() {
  const {
    state,
    submitCommand,
    submitCommands,
    prepareAttachmentUploadCommands
  } = useAppShell();
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const viewerRole = resolveCurrentRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const selectedScale = projection?.selectedScale ?? activeMatch?.selectedScale;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const localMedia = useLocalMediaAttachments(createUuid);
  const inlineMode = resolveInlineLiveMapActionMode(viewerRole, projection);
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
  const selectedCategory = findQuestionCategory(defaultContentPack, selectedCategoryId);
  const availableTemplates = filterTemplatesForScale(
    categoryViewModels.find((entry) => entry.category.categoryId === selectedCategoryId)?.templates ?? [],
    selectedScale
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
  const readyTemplates = availableTemplates.filter((template) =>
    activeSelectionRound?.availableTemplateIds.includes(template.templateId)
  );
  const selectedTemplate = findQuestionTemplate(defaultContentPack, selectedTemplateId);
  const readyTemplate = readyTemplates.find((template) => template.templateId === selectedTemplateId)
    ?? readyTemplates[0]
    ?? selectedTemplate;

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

  const activeQuestion = findActiveQuestion(projection);
  const activeQuestionTemplate = findQuestionTemplate(defaultContentPack, activeQuestion?.templateId);
  const activeQuestionCategory = findQuestionCategory(defaultContentPack, activeQuestion?.categoryId);
  const [answerDraft, setAnswerDraft] = useState<QuestionAnswerDraft>(() =>
    createInitialAnswerDraft(activeQuestionTemplate)
  );

  useEffect(() => {
    setAnswerDraft(createInitialAnswerDraft(activeQuestionTemplate));
  }, [activeQuestion?.questionInstanceId, activeQuestionTemplate]);

  const visibleMap = projection?.visibleMap;
  const selectedRegionId = visibleMap?.regionId;
  const previewFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (readyTemplate?.featureClassRefs ?? []).map((feature) => feature.featureClassId)
  );
  const answerFeatureData = getSeedRegionFeatureData(
    selectedRegionId,
    (activeQuestionTemplate?.featureClassRefs ?? []).map((feature) => feature.featureClassId)
  );

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
  const questionEvidenceHint = activeMatch?.onlineStatus?.attachmentStorageMode === 'durable_supabase_storage'
    ? 'Recording evidence here uploads the image to shared storage and records it in the match.'
    : activeMatch?.runtimeKind === 'online_foundation'
      ? 'Recording evidence here records the attachment in the match, but this session may still be metadata-only for the binary image.'
      : 'Recording evidence here creates a real attachment record. The image preview stays local to this device session.';

  const deckViewModels = useMemo(
    () => buildDeckViewModels(defaultContentPack, projection, viewerRole),
    [projection, viewerRole]
  );
  const hiderDeck = deckViewModels.find((deck) => deck.deck.ownerScope === 'hider_team') ??
    deckViewModels.find((deck) => deck.deck.ownerScope === 'hider_player');
  const [selectedResponseCardIds, setSelectedResponseCardIds] = useState<string[]>([]);
  const [selectedHandCardId, setSelectedHandCardId] = useState<string | undefined>(
    hiderDeck?.visibleByZone.hand[0]?.card.cardInstanceId
  );

  useEffect(() => {
    const handIds = new Set(hiderDeck?.visibleByZone.hand.map((card) => card.card.cardInstanceId) ?? []);
    setSelectedResponseCardIds((current) => current.filter((cardId) => handIds.has(cardId)));
    if (!selectedHandCardId || !handIds.has(selectedHandCardId)) {
      setSelectedHandCardId(hiderDeck?.visibleByZone.hand[0]?.card.cardInstanceId);
    }
  }, [hiderDeck, selectedHandCardId]);

  const selectedHandCard = hiderDeck?.visibleByZone.hand.find(
    (card) => card.card.cardInstanceId === selectedHandCardId
  );
  const responseSelectionLimit = activeQuestionCategory?.categoryId === 'tentacles' ? 2 : 1;
  const selectedResponseReason = selectedHandCard
    ? buildQuestionResponseCardReason(selectedHandCard.definition, activeQuestionCategory?.categoryId, selectedScale)
    : undefined;
  const activeCard = hiderDeck?.visibleByZone.pending_resolution[0];
  const activeCardBehavior = activeCard ? buildCardBehaviorModel(activeCard.definition) : undefined;
  const canResolveCard = Boolean(activeMatch && canResolveCardWindow(viewerRole, projection));
  const resolveDisabledReason = activeCard && !canResolveCard
    ? 'Only the host can close this card window after the live effect is handled.'
    : undefined;

  const activeQuestionTimerSeconds = timingModel?.timers.find(
    (timer) => timer.kind === 'question' && timer.status !== 'completed'
  )?.remainingSeconds;

  const activeQuestionConstraint = findConstraintForQuestion(projection, activeQuestion?.questionInstanceId);
  const canAskQuestion = Boolean(
    activeMatch &&
      capabilities.canAskQuestions &&
      readyTemplate &&
      projection?.lifecycleState === 'seek_phase' &&
      (projection.seekPhaseSubstate === 'ready' || projection.seekPhaseSubstate === 'awaiting_question_selection')
  );
  const canAnswerQuestion = Boolean(
    activeMatch &&
      capabilities.canAnswerQuestions &&
      activeQuestion &&
      activeQuestionTemplate &&
      projection?.lifecycleState === 'seek_phase' &&
      projection.seekPhaseSubstate === 'awaiting_question_answer'
  );
  const canApplyQuestion = Boolean(
    activeMatch &&
      capabilities.canResolveQuestions &&
      activeQuestion &&
      activeQuestionTemplate &&
      activeQuestionCategory &&
      projection?.lifecycleState === 'seek_phase' &&
      projection.seekPhaseSubstate === 'applying_constraints'
  );

  const handleAskQuestion = () => {
    if (!projection || !readyTemplate) {
      return;
    }

    const commands = [];
    if (projection.seekPhaseSubstate === 'ready') {
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

  const handleApplyQuestion = () => {
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

  if (!inlineMode) {
    return null;
  }

  if (inlineMode === 'ask' && selectedCategory && readyTemplate) {
    const impact = describeQuestionImpactExpectation({
      template: readyTemplate,
      category: selectedCategory,
      regionId: selectedRegionId
    });

    return (
      <View style={[styles.sheet, styles.sheetAccent]}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetBadge}>
            <Text style={styles.sheetBadgeLabel}>Ask from map</Text>
          </View>
          <Text style={styles.sheetTitle}>Ask the next clue</Text>
          <Text style={styles.sheetCopy}>
            Choose the live workbook draw and send it without leaving the map.
          </Text>
        </View>
        <LiveMapInfoChips
          items={[
            { label: 'Clue type', value: selectedCategory.name, tone: 'accent' },
            { label: 'Workbook rule', value: formatQuestionDrawRule(selectedCategory) },
            {
              label: 'Timer',
              value: formatTimerPolicyLabel(selectedCategory.defaultTimerPolicy, selectedScale)
            }
          ]}
        />
        <QuestionCategoryList
          categories={categoryViewModels}
          selectedCategoryId={selectedCategoryId}
          selectedScale={selectedScale}
          onSelect={setSelectedCategoryId}
        />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current workbook draw</Text>
          <QuestionTemplateList
            templates={readyTemplates}
            category={selectedCategory}
            selectedTemplateId={readyTemplate.templateId}
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
          <Text style={styles.helper}>
            {describeQuestionCategoryForPlayers(selectedCategory)}
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Selected clue</Text>
          <Text style={styles.highlight}>{readyTemplate.name}</Text>
          <Text style={styles.copy}>{describeQuestionTemplateForPlayers(readyTemplate, selectedCategory)}</Text>
          <StateBanner tone={impact.tone} title={impact.label} detail={impact.detail} />
          <LiveMapInfoChips
            items={[
              { label: 'How to answer', value: describeExpectedAnswerGuidance(readyTemplate) },
              { label: 'Game sizes', value: formatQuestionScaleSet(readyTemplate.scaleSet.appliesTo) },
              {
                label: 'Support today',
                value: describeTemplateSupport({
                  template: readyTemplate,
                  category: selectedCategory,
                  regionId: selectedRegionId
                })
              }
            ]}
          />
          {previewFeatureData.length > 0 ? (
            <Text style={styles.helper}>
              This map already has matching place data for this clue, so it can do more than record evidence.
            </Text>
          ) : null}
          <View style={styles.actionRow}>
            <AppButton
              label="Ask This Clue"
              onPress={handleAskQuestion}
              disabled={!canAskQuestion || state.loadState === 'loading'}
            />
            <AppButton
              label="Full Clue Review"
              tone="secondary"
              onPress={() => {
                router.push('/questions');
              }}
            />
          </View>
        </View>
      </View>
    );
  }

  if (inlineMode === 'answer' && activeQuestion && activeQuestionTemplate && activeQuestionCategory) {
    return (
      <View style={[styles.sheet, styles.sheetWarning]}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetBadge}>
            <Text style={styles.sheetBadgeLabel}>Answer from map</Text>
          </View>
          <Text style={styles.sheetTitle}>Answer the live clue</Text>
          <Text style={styles.sheetCopy}>
            Send the hider response here and keep your hand in view while the timer is running.
          </Text>
        </View>
        <LiveMapInfoChips
          items={[
            { label: 'Live clue', value: activeQuestionTemplate.name, tone: 'warning' },
            {
              label: 'Timer',
              value: activeQuestionTimerSeconds !== undefined ? formatCountdown(activeQuestionTimerSeconds) : 'Waiting'
            },
            { label: 'Response cards', value: `${selectedResponseCardIds.length} of ${responseSelectionLimit}` }
          ]}
        />
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current clue</Text>
          <Text style={styles.highlight}>{activeQuestionTemplate.name}</Text>
          <Text style={styles.copy}>{describeQuestionTemplateForPlayers(activeQuestionTemplate, activeQuestionCategory)}</Text>
          <Text style={styles.helper}>
            {describeExpectedAnswerGuidance(activeQuestionTemplate)}
          </Text>
        </View>
        {hiderDeck ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Hand context</Text>
            <LiveMapInfoChips
              items={[
                { label: 'Hand', value: `${hiderDeck.visibleByZone.hand.length} / ${HIDER_HAND_TARGET}` },
                { label: 'Draw pile', value: hiderDeck.visibleByZone.draw_pile.length },
                { label: 'Clue type', value: activeQuestionCategory.name }
              ]}
            />
            <CardZoneSection
              title="Current hand"
              cards={hiderDeck.visibleByZone.hand}
              emptyText="No visible hand cards are available in this scope."
              selectedCardInstanceId={selectedHandCardId}
              onSelect={setSelectedHandCardId}
            />
            <AppButton
              label={
                selectedHandCard && selectedResponseCardIds.includes(selectedHandCard.card.cardInstanceId)
                  ? 'Remove From Response Picks'
                  : `Mark For Response (${responseSelectionLimit} max)`
              }
              tone="secondary"
              onPress={() => {
                if (!selectedHandCard) {
                  return;
                }

                setSelectedResponseCardIds((current) => {
                  const cardId = selectedHandCard.card.cardInstanceId;
                  if (current.includes(cardId)) {
                    return current.filter((candidate) => candidate !== cardId);
                  }

                  return [...current, cardId].slice(-responseSelectionLimit);
                });
              }}
              disabled={!selectedHandCard || state.loadState === 'loading'}
            />
            {selectedResponseReason ? <Text style={styles.helper}>{selectedResponseReason}</Text> : null}
          </View>
        ) : null}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Send the answer</Text>
          <QuestionAnswerComposer
            template={activeQuestionTemplate}
            category={activeQuestionCategory}
            draft={answerDraft}
            candidateFeatures={answerFeatureData}
            disabled={!canAnswerQuestion || state.loadState === 'loading'}
            onChange={setAnswerDraft}
          />
        </View>
        {questionAttachmentContext ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Evidence</Text>
            <EvidenceCapturePanel
              context={questionAttachmentContext}
              drafts={questionEvidenceDrafts}
              visibleAttachments={activeQuestionEvidenceContext?.attachments ?? []}
              disabled={!activeMatch || state.loadState === 'loading' || !canAnswerQuestion}
              busy={localMedia.isContextBusy(questionAttachmentContext.contextId)}
              feedback={localMedia.getContextFeedback(questionAttachmentContext.contextId)}
              localPreviewByAttachmentId={localMedia.localPreviewByAttachmentId}
              submitLabel="Record Evidence"
              submitDisabled={questionEvidenceDrafts.length === 0}
              submitHint={questionEvidenceHint}
              emptyVisibleText="No visible clue evidence has been recorded yet."
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
          </View>
        ) : null}
        {activeCard ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Open card effect</Text>
            {activeCardBehavior ? (
              <StateBanner
                tone={activeCardBehavior.tone}
                title={`${activeCardBehavior.label} card window is open`}
                detail={activeCardBehavior.detail}
              />
            ) : null}
            <CardResolutionStatusPanel
              activeCard={activeCard}
              resolution={projection?.activeCardResolution}
              canResolve={canResolveCard}
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
          </View>
        ) : null}
        <View style={styles.actionRow}>
          <AppButton
            label="Submit Answer"
            onPress={handleAnswerQuestion}
            disabled={!canAnswerQuestion || state.loadState === 'loading'}
          />
          <AppButton
            label="Full Deck View"
            tone="secondary"
            onPress={() => {
              router.push('/cards');
            }}
          />
          <AppButton
            label="Full Clue Review"
            tone="secondary"
            onPress={() => {
              router.push('/questions');
            }}
          />
        </View>
      </View>
    );
  }

  if (inlineMode === 'apply' && activeQuestion && activeQuestionTemplate && activeQuestionCategory) {
    return (
      <View style={[styles.sheet, styles.sheetSuccess]}>
        <View style={styles.sheetHeader}>
          <View style={styles.sheetBadge}>
            <Text style={styles.sheetBadgeLabel}>Apply from map</Text>
          </View>
          <Text style={styles.sheetTitle}>Apply the result</Text>
          <Text style={styles.sheetCopy}>
            Review the live answer and update the map in place so everyone sees the new search area immediately.
          </Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ready to update the map</Text>
          <Text style={styles.highlight}>{activeQuestionTemplate.name}</Text>
          <Text style={styles.copy}>{describeQuestionTemplateForPlayers(activeQuestionTemplate, activeQuestionCategory)}</Text>
          <LiveMapInfoChips
            items={[
              { label: 'Answer recorded', value: activeQuestion.answer ? 'Yes' : 'Waiting', tone: 'success' },
              { label: 'Clue type', value: activeQuestionCategory.name },
              { label: 'Search area', value: visibleMap?.remainingArea?.precision ?? 'Waiting for map' }
            ]}
          />
          <Text style={styles.helper}>
            Apply the answer here. The map will update in place and stay honest about whether the result was exact, approximate, or evidence only.
          </Text>
        </View>
        {activeQuestionConstraint ? (
          <QuestionResolutionPanel
            title="Current active resolution"
            question={activeQuestion}
            template={activeQuestionTemplate}
            category={activeQuestionCategory}
            constraint={activeQuestionConstraint}
            visibleMap={visibleMap}
          />
        ) : null}
        <View style={styles.actionRow}>
          <AppButton
            label="Apply Result To Map"
            onPress={handleApplyQuestion}
            disabled={!canApplyQuestion || state.loadState === 'loading'}
          />
          <AppButton
            label="Full Clue Review"
            tone="secondary"
            onPress={() => {
              router.push('/questions');
            }}
          />
        </View>
      </View>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  sheet: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 26,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 20,
    elevation: 2
  },
  sheetAccent: {
    backgroundColor: colors.accentMuted
  },
  sheetWarning: {
    backgroundColor: colors.warningMuted
  },
  sheetSuccess: {
    backgroundColor: colors.successMuted
  },
  sheetHeader: {
    gap: 6
  },
  sheetBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  sheetBadgeLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800'
  },
  sheetCopy: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 18,
    gap: 10,
    padding: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  highlight: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  helper: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  actionRow: {
    gap: 10
  }
});
