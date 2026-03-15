import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { MapCanvas } from '../features/map/MapCanvas';
import type { PlayableRegionCatalogEntry } from '../features/map/index.ts';
import { defaultContentPack } from '../runtime/default-content-pack.ts';

import {
  MapLegend,
  SelectedRegionChipList,
  SearchableRegionPicker,
  addRegionToSelection,
  buildAppliedRegionDraft,
  buildMapOverlayModel,
  buildCompositePlayableRegion,
  buildMapScaleGuidanceModel,
  buildMapSetupBootstrapCommands,
  clearSelectedRegions,
  mobileRegionDataSource,
  removeRegionFromSelection,
  useRegionSearch
} from '../features/map/index.ts';
import {
  QuestionResolutionPanel,
  buildQuestionMapEffectModel,
  findConstraintForQuestion,
  findLatestResolvedQuestion,
  findQuestionCategory,
  findQuestionTemplate
} from '../features/questions/index.ts';
import {
  MatchTimingBanner,
  MatchTimingPanel,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function createMapRegionCommand(selectedRegion: PlayableRegionCatalogEntry): DomainCommand {
  return {
    type: 'create_map_region',
    payload: {
      regionId: selectedRegion.regionId,
      displayName: selectedRegion.displayName,
      regionKind: selectedRegion.regionKind,
      featureDatasetRefs: selectedRegion.featureDatasetRefs,
      geometry: selectedRegion.geometry
    }
  };
}

function sameSelection(left: PlayableRegionCatalogEntry[], right: PlayableRegionCatalogEntry[]) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((region, index) => region.regionId === right[index]?.regionId);
}

function describeSetupMode(runtimeKind: string | undefined) {
  switch (runtimeKind) {
    case 'single_device_referee':
      return 'Single-device referee session on this device';
    case 'nearby_host_authority':
      return 'Nearby host session on the local network';
    case 'online_foundation':
      return 'Online cloud session';
    case 'in_memory':
    default:
      return 'Local on-device test session';
  }
}

function formatScaleLabel(scale: 'small' | 'medium' | 'large') {
  switch (scale) {
    case 'small':
      return 'Small';
    case 'medium':
      return 'Medium';
    case 'large':
      return 'Large';
  }
}

function describeSetupState(args: {
  loadState: string;
  freshnessLabel?: string;
  activeMatchExists: boolean;
}) {
  if (!args.activeMatchExists) {
    return 'Connect a match to start map setup.';
  }

  if (args.loadState === 'loading') {
    return 'Updating the active match state.';
  }

  if (args.loadState === 'error') {
    return 'The latest setup action needs attention.';
  }

  if (args.freshnessLabel) {
    return `Updated ${args.freshnessLabel.toLowerCase()}.`;
  }

  return 'Waiting for the first synced match state.';
}

export function MapScreen() {
  const dimensions = useWindowDimensions();
  const { state, submitCommands, refreshActiveMatch, saveMapSetupDraft, clearMapSetupDraft } = useAppShell();
  const [showLegend, setShowLegend] = useState(false);
  const activeMatch = state.activeMatch;
  const mapSetupDraft = activeMatch ? state.uiState.mapSetupDrafts[activeMatch.matchId] : undefined;
  const [selectedRegions, setSelectedRegions] = useState<PlayableRegionCatalogEntry[]>(
    () => mapSetupDraft?.selectedRegions ?? []
  );
  const regionSearch = useRegionSearch({
    source: mobileRegionDataSource,
    initialQuery: mapSetupDraft?.query,
    initialRegionId: mapSetupDraft?.selectedPreviewRegionId
  });
  const projection = activeMatch?.projection;
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const appliedRegion = buildAppliedRegionDraft(projection?.visibleMap)[0];
  const scaleGuidance = buildMapScaleGuidanceModel({
    selectedRegions: selectedRegions.length > 0 ? selectedRegions : appliedRegion ? [appliedRegion] : [],
    appliedMap: projection?.visibleMap
  });
  const latestResolvedQuestion = findLatestResolvedQuestion(projection);
  const latestResolvedConstraint = findConstraintForQuestion(
    projection,
    latestResolvedQuestion?.questionInstanceId
  );
  const latestResolvedTemplate = findQuestionTemplate(
    defaultContentPack,
    latestResolvedQuestion?.templateId
  );
  const latestResolvedCategory = findQuestionCategory(
    defaultContentPack,
    latestResolvedQuestion?.categoryId
  );
  const latestQuestionEffect = useMemo(
    () =>
      buildQuestionMapEffectModel({
        question: latestResolvedQuestion,
        template: latestResolvedTemplate,
        category: latestResolvedCategory,
        constraint: latestResolvedConstraint,
        visibleMap: projection?.visibleMap
      }),
    [
      latestResolvedCategory,
      latestResolvedConstraint,
      latestResolvedQuestion,
      latestResolvedTemplate,
      projection?.visibleMap
    ]
  );
  const lastSyncAppliedConstraint = Boolean(
    state.lastSync?.eventStream.events.some((eventFrame) => eventFrame.type === 'constraint_applied') &&
      latestQuestionEffect
  );
  const compositePreviewRegion = useMemo(
    () => buildCompositePlayableRegion(selectedRegions),
    [selectedRegions]
  );
  const previewRegion = compositePreviewRegion ?? regionSearch.selectedRegion;
  const overlayModel = useMemo(
    () => buildMapOverlayModel({
      visibleMap: projection?.visibleMap,
      visibleMovementTracks: projection?.visibleMovementTracks,
      previewRegion
    }),
    [previewRegion, projection?.visibleMap, projection?.visibleMovementTracks]
  );
  const isHostView = activeMatch?.recipient.scope === 'host_admin' || activeMatch?.playerRole === 'host';
  const canPrepareMapSetup =
    isHostView &&
    projection &&
    ['draft', 'lobby', 'role_assignment', 'rules_confirmation'].includes(projection.lifecycleState);
  const canApplySelectedRegion =
    isHostView &&
    projection?.lifecycleState === 'map_setup' &&
    Boolean(compositePreviewRegion);
  const mapHasBeenApplied = Boolean(projection?.visibleMap);
  const draftDiffersFromApplied = Boolean(
    compositePreviewRegion &&
    projection?.visibleMap &&
    compositePreviewRegion.regionId !== projection.visibleMap.regionId
  );
  const mapHeight = Math.max(190, Math.min(Math.round(dimensions.height * 0.24), 250));
  const regionSummary = projection?.visibleMap?.displayName ?? compositePreviewRegion?.displayName ?? previewRegion?.displayName ?? 'No region selected';
  const candidateSummary = projection?.visibleMap?.remainingArea
    ? `${projection.visibleMap.remainingArea.precision} / clipped=${String(projection.visibleMap.remainingArea.clippedToRegion)}`
    : compositePreviewRegion
      ? `${selectedRegions.length} selected ${selectedRegions.length === 1 ? 'region' : 'regions'}`
      : 'Pending region application';
  const selectedSourcesSummary =
    compositePreviewRegion?.compositeMetadata?.sourceProviderLabels.join(', ') ??
    compositePreviewRegion?.sourceLabel ??
    previewRegion?.sourceLabel ??
    'No provider selected yet';
  const disconnectedWarning = compositePreviewRegion?.compositeMetadata?.disconnectedWarning;
  const previewRegionAlreadyAdded = Boolean(
    regionSearch.selectedRegion &&
    selectedRegions.some((region) => region.regionId === regionSearch.selectedRegion?.regionId)
  );
  const activeSelectionFeatureRefs = compositePreviewRegion?.featureDatasetRefs ?? previewRegion?.featureDatasetRefs ?? [];
  const activeSelectionCoverage = compositePreviewRegion?.countryLabel ?? previewRegion?.countryLabel;
  const activeSelectionParentLabel = compositePreviewRegion?.parentRegionLabel ?? previewRegion?.parentRegionLabel;
  const compositeDissolveNotice = compositePreviewRegion?.compositeMetadata?.dissolveNotice;
  const selectionBadgeLabel =
    selectedRegions.length > 1
      ? 'Composite'
      : compositePreviewRegion?.regionKind ?? previewRegion?.regionKind ?? 'Preview';
  const setupStateSummary = describeSetupState({
    loadState: state.loadState,
    freshnessLabel: timingModel?.freshnessLabel,
    activeMatchExists: Boolean(activeMatch)
  });

  useEffect(() => {
    const persistedSelection = mapSetupDraft?.selectedRegions ?? [];
    setSelectedRegions((current) => (sameSelection(current, persistedSelection) ? current : persistedSelection));
  }, [activeMatch?.matchId, mapSetupDraft?.selectedRegions]);

  useEffect(() => {
    if (!activeMatch) {
      return;
    }

    saveMapSetupDraft({
      matchId: activeMatch.matchId,
      selectedRegions,
      query: regionSearch.query,
      selectedPreviewRegionId: regionSearch.selectedRegionId
    });
  }, [
    activeMatch,
    regionSearch.query,
    regionSearch.selectedRegionId,
    saveMapSetupDraft,
    selectedRegions
  ]);

  return (
    <ScreenContainer
      title="Map Setup"
      subtitle="Search for playable regions, build the match boundary, and apply it to the active game map."
      topSlot={<ProductNavBar current="map" />}
    >
        {!activeMatch ? (
          <StateBanner
            tone="warning"
            title="No active match"
            detail="Create or join a match first. Map changes are applied through the active match connection."
          />
        ) : null}

        {activeMatch && !isHostView ? (
          <StateBanner
            tone="warning"
            title="Host access required"
            detail="Only host views can move the match into map setup or apply a new playable region."
          />
        ) : null}

        {projection?.lifecycleState === 'map_setup' ? (
          <StateBanner
            tone="info"
            title="Ready to apply"
            detail="Applying the current selection updates the playable boundary and resets the candidate search area inside it."
          />
        ) : null}

        {state.loadState === 'error' && state.errorMessage ? (
          <StateBanner
            tone="error"
            title="Map operation failed"
            detail={state.errorMessage}
          />
        ) : null}

        <MatchTimingBanner model={timingModel} />

        {lastSyncAppliedConstraint && latestQuestionEffect ? (
          <StateBanner
            tone={latestQuestionEffect.resolutionTone}
            title={`${latestQuestionEffect.resolutionModeLabel} map update applied`}
            detail={latestQuestionEffect.mapEffectDetail}
          />
        ) : null}

        {activeMatch ? (
          <Panel
            title="Match Timing"
            subtitle="Hide phase, cooldowns, and pause state stay visible while you work on the playable region."
          >
            <MatchTimingPanel model={timingModel} />
          </Panel>
        ) : null}

        {activeMatch ? (
          <Panel
            title="Setup Status"
            subtitle="Keep track of what is already applied, what is still in draft, and which scale best fits the current boundary."
          >
            <FactList
              items={[
                { label: 'Session Mode', value: describeSetupMode(activeMatch.runtimeKind) },
                { label: 'State Update', value: setupStateSummary },
                { label: 'Applied Region', value: projection?.visibleMap?.displayName ?? 'Not applied yet' },
                {
                  label: 'Draft Selection',
                  value:
                    selectedRegions.length === 0
                      ? 'No draft regions selected'
                      : selectedRegions.length === 1
                        ? selectedRegions[0]?.displayName ?? '1 region selected'
                        : `${selectedRegions.length} regions selected`
                },
                { label: 'Suggested Scale', value: formatScaleLabel(scaleGuidance.suggestedScale) }
              ]}
            />
            <Text style={styles.copy}>{scaleGuidance.title}</Text>
            <Text style={styles.copy}>{scaleGuidance.detail}</Text>
            <Text style={styles.helperCopy}>{scaleGuidance.note}</Text>
            <View style={styles.scaleRow}>
              {(['small', 'medium', 'large'] as const).map((scale) => {
                const recommended = scaleGuidance.suggestedScale === scale;
                return (
                  <View
                    key={scale}
                    style={[
                      styles.scaleChip,
                      recommended ? styles.scaleChipRecommended : null
                    ]}
                  >
                    <Text
                      style={[
                        styles.scaleChipLabel,
                        recommended ? styles.scaleChipLabelRecommended : null
                      ]}
                    >
                      {formatScaleLabel(scale)}
                    </Text>
                  </View>
                );
              })}
            </View>
            {draftDiffersFromApplied ? (
              <StateBanner
                tone="info"
                title="Draft changes are ready to apply"
                detail="The previewed boundary is different from the region currently applied to the match."
              />
            ) : null}
          </Panel>
        ) : null}

        {projection?.visibleMap ? (
          <Panel
            title="Latest Question Update"
            subtitle="The most recent resolved question that changed or annotated the search map."
          >
            <QuestionResolutionPanel
              title="Question-To-Map Summary"
              question={latestResolvedQuestion}
              template={latestResolvedTemplate}
              category={latestResolvedCategory}
              constraint={latestResolvedConstraint}
              visibleMap={projection.visibleMap}
              actionSlot={
                latestResolvedQuestion ? (
                  <AppButton
                    label="Open Question Center"
                    tone="secondary"
                    onPress={() => {
                      router.push('/questions');
                    }}
                  />
                ) : undefined
              }
            />
          </Panel>
        ) : null}

        <Panel
          title="Find Regions"
          subtitle="Search by city or administrative region, review the returned boundary, and add it to the current playable map."
        >
          <SearchableRegionPicker
            query={regionSearch.query}
            minimumQueryLengthMet={regionSearch.minimumQueryLengthMet}
            results={regionSearch.regions}
            previewRegion={regionSearch.selectedRegion}
            selectedRegionId={regionSearch.selectedRegionId}
            selectedRegionCount={selectedRegions.length}
            sourceLabel={regionSearch.sourceLabel}
            usingFallback={regionSearch.usingFallback}
            noticeMessage={regionSearch.noticeMessage}
            attribution={regionSearch.attribution}
            isLoading={regionSearch.isLoading}
            errorMessage={regionSearch.errorMessage}
            onChangeQuery={regionSearch.setQuery}
            onRetry={regionSearch.retrySearch}
            onSelect={(regionId) => {
              void regionSearch.selectRegion(regionId);
            }}
            onAddPreviewRegion={() => {
              if (!regionSearch.selectedRegion) {
                return;
              }

              setSelectedRegions((currentRegions) => addRegionToSelection(currentRegions, regionSearch.selectedRegion!));
            }}
            canAddPreviewRegion={Boolean(regionSearch.selectedRegion) && !previewRegionAlreadyAdded}
            previewRegionAlreadyAdded={previewRegionAlreadyAdded}
          />
        </Panel>

        <Panel
          title="Playable Region"
          subtitle="Build a draft playable boundary, then apply it through the real match setup flow."
        >
          {compositePreviewRegion ? (
            <View style={styles.selectedSection}>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedTextBlock}>
                  <Text style={styles.title}>{compositePreviewRegion.displayName}</Text>
                  <Text style={styles.copy}>{compositePreviewRegion.summary}</Text>
                </View>
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeLabel}>{selectionBadgeLabel}</Text>
                </View>
              </View>

              <SelectedRegionChipList
                regions={selectedRegions}
                onRemove={(regionId) => {
                  setSelectedRegions((currentRegions) => removeRegionFromSelection(currentRegions, regionId));
                }}
                onClearAll={() => {
                  setSelectedRegions(clearSelectedRegions());
                }}
              />

              {disconnectedWarning ? (
                <StateBanner
                  tone="warning"
                  title="Selections appear disconnected"
                  detail={disconnectedWarning.summary}
                />
              ) : null}

              {compositeDissolveNotice ? (
                <StateBanner
                  tone="warning"
                  title="Using safe composite fallback"
                  detail={compositeDissolveNotice}
                />
              ) : null}

              <View style={styles.metricGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Components</Text>
                  <Text style={styles.metricValue}>
                    {selectedRegions.length} {selectedRegions.length === 1 ? 'region' : 'regions'}
                  </Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Candidate</Text>
                  <Text style={styles.metricValue}>{candidateSummary}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Region</Text>
                  <Text style={styles.metricValue}>{regionSummary}</Text>
                </View>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Sources</Text>
                  <Text style={styles.metricValue}>{selectedSourcesSummary}</Text>
                </View>
              </View>

              {activeSelectionCoverage ? (
                <Text style={styles.copy}>
                  Coverage: {activeSelectionCoverage}
                  {activeSelectionParentLabel && activeSelectionParentLabel !== compositePreviewRegion.displayName
                    ? ` · ${activeSelectionParentLabel}`
                    : ''}
                </Text>
              ) : null}
              <Text style={styles.copy}>Feature datasets: {activeSelectionFeatureRefs.join(', ')}</Text>
            </View>
          ) : regionSearch.selectedRegion ? (
            <StateBanner
              tone="info"
              title="Region selected"
              detail="The current search result is being previewed. Add it to the playable region to keep it in the final selection."
            />
          ) : (
            <StateBanner
              tone="info"
              title="No regions selected"
              detail="Search above, preview a boundary, then add one or more regions to build the playable map."
            />
          )}

          <View style={styles.actionGrid}>
            <AppButton
              label={state.loadState === 'loading' ? 'Working...' : 'Open Map Setup Stage'}
              onPress={() => {
                if (!projection || !canPrepareMapSetup) {
                  return;
                }

                const commands = buildMapSetupBootstrapCommands(projection);
                if (commands.length === 0) {
                  void refreshActiveMatch();
                  return;
                }

                void submitCommands(commands);
              }}
              disabled={!canPrepareMapSetup || state.loadState === 'loading'}
            />
            <AppButton
              label={
                mapHasBeenApplied
                  ? 'Replace Playable Region'
                  : 'Apply Playable Region'
              }
              onPress={() => {
                if (!canApplySelectedRegion || !compositePreviewRegion) {
                  return;
                }

                void submitCommands([createMapRegionCommand(compositePreviewRegion)]);
              }}
              disabled={!canApplySelectedRegion || state.loadState === 'loading'}
            />
            <AppButton
              label="Clear Draft Selection"
              onPress={() => {
                setSelectedRegions(clearSelectedRegions());
                regionSearch.setQuery('');
                regionSearch.clearSelection();
                if (activeMatch) {
                  clearMapSetupDraft(activeMatch.matchId);
                }
              }}
              tone="secondary"
              disabled={selectedRegions.length === 0 || state.loadState === 'loading'}
            />
            <AppButton
              label="Refresh Setup State"
              onPress={() => {
                void refreshActiveMatch();
              }}
              tone="secondary"
              disabled={!activeMatch || state.loadState === 'loading'}
            />
          </View>
        </Panel>

        <Panel
          title="Map Preview"
          subtitle="Use the preview to confirm the current playable boundary and candidate area before or after applying changes."
        >
          <View style={styles.previewHeader}>
            <View style={styles.previewTextBlock}>
              <Text style={styles.copy}>
                The preview shows the selected boundary, the current candidate area, and any visible overlays inside the active playable region.
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={() => setShowLegend((value) => !value)}
              style={({ pressed }) => [
                styles.legendToggle,
                pressed ? styles.legendTogglePressed : null
              ]}
            >
              <Text style={styles.legendToggleLabel}>{showLegend ? 'Hide Legend' : 'Show Legend'}</Text>
            </Pressable>
          </View>
          <MapCanvas
            height={mapHeight}
            maxWidth={dimensions.width - 32}
            visibleMap={projection?.visibleMap}
            visibleMovementTracks={projection?.visibleMovementTracks}
            previewRegion={previewRegion}
          />
          {showLegend ? (
            <View style={styles.legendCard}>
              <MapLegend overlayModel={overlayModel} compact />
            </View>
          ) : null}
          <Text style={styles.previewMeta}>
            Constraint layers: {String(projection?.visibleMap?.constraintArtifacts.length ?? 0)} · Eliminated areas: {String(projection?.visibleMap?.eliminatedAreas.length ?? 0)} · Selected regions: {String(selectedRegions.length)}
          </Text>
        </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700'
  },
  selectedSection: {
    gap: 10
  },
  selectedHeader: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  selectedTextBlock: {
    flex: 1,
    gap: 6
  },
  selectedBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.accentMuted,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  selectedBadgeLabel: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  helperCopy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  scaleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  scaleChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  scaleChipRecommended: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  scaleChipLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  scaleChipLabelRecommended: {
    color: colors.accent
  },
  metricGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  metricCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    flexGrow: 1,
    gap: 4,
    minWidth: '46%',
    padding: 12
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  metricValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  actionGrid: {
    gap: 10
  },
  previewHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  previewTextBlock: {
    flex: 1
  },
  legendToggle: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  legendTogglePressed: {
    opacity: 0.85
  },
  legendToggleLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  legendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    padding: 10
  },
  previewMeta: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  }
});
