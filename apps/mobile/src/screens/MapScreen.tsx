import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';
import { MapCanvas } from '../features/map/MapCanvas';
import type { PlayableRegionCatalogEntry } from '../features/map/index.ts';

import {
  MapLegend,
  SelectedRegionChipList,
  SearchableRegionPicker,
  addRegionToSelection,
  buildMapOverlayModel,
  buildCompositePlayableRegion,
  buildMapSetupBootstrapCommands,
  clearSelectedRegions,
  mobileRegionDataSource,
  removeRegionFromSelection,
  useRegionSearch
} from '../features/map/index.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
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

export function MapScreen() {
  const dimensions = useWindowDimensions();
  const { state, submitCommands, refreshActiveMatch } = useAppShell();
  const [showLegend, setShowLegend] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<PlayableRegionCatalogEntry[]>([]);
  const regionSearch = useRegionSearch({
    source: mobileRegionDataSource
  });
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
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

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Map Setup</Text>
          <Text style={styles.headerSubtitle}>
            Search for one or more playable cities or administrative regions, build a composite bounded preview, then apply the final geometry through the real runtime flow.
          </Text>
        </View>

        {!activeMatch ? (
          <StateBanner
            tone="warning"
            title="No active match"
            detail="Create or join a match first. The map screen only applies regions through an active runtime connection."
          />
        ) : null}

        {activeMatch && !isHostView ? (
          <StateBanner
            tone="warning"
            title="Host access required"
            detail="Only host-admin views can bootstrap map setup and apply a playable region."
          />
        ) : null}

        {projection?.lifecycleState === 'map_setup' ? (
          <StateBanner
            tone="info"
            title="Map setup is ready"
            detail="Applying the current selection will trigger create_map_region and reinitialize the candidate search area from the combined playable boundary."
          />
        ) : null}

        {state.loadState === 'error' && state.errorMessage ? (
          <StateBanner
            tone="error"
            title="Map operation failed"
            detail={state.errorMessage}
          />
        ) : null}

        <Panel title="Search Regions">
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

        <Panel title="Game Map Builder">
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
              title="Preview selected region"
              detail="The current search result is being previewed. Add it to the game map to keep it in the composite playable region and enable apply."
            />
          ) : (
            <StateBanner
              tone="info"
              title="No regions added yet"
              detail="Use the search panel above, preview a provider-backed result, then add one or more regions to build the playable map."
            />
          )}

          <View style={styles.actionGrid}>
            <AppButton
              label={state.loadState === 'loading' ? 'Working...' : 'Prepare Match For Map Setup'}
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
                  ? 'Replace Playable Region With Composite'
                  : 'Apply Composite Playable Region'
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
              label="Clear Selected Regions"
              onPress={() => {
                setSelectedRegions(clearSelectedRegions());
              }}
              tone="secondary"
              disabled={selectedRegions.length === 0 || state.loadState === 'loading'}
            />
            <AppButton
              label="Refresh Map Projection"
              onPress={() => {
                void refreshActiveMatch();
              }}
              tone="secondary"
              disabled={!activeMatch || state.loadState === 'loading'}
            />
          </View>
        </Panel>

        <Panel title="Boundary Preview">
          <View style={styles.previewHeader}>
            <View style={styles.previewTextBlock}>
              <Text style={styles.copy}>
                The map preview is secondary during setup: it shows the combined playable boundary for the current selection and the current bounded candidate area without crowding the search workflow.
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
            Constraint layers: {String(projection?.visibleMap?.constraintArtifacts.length ?? 0)} · Eliminated areas: {String(projection?.visibleMap?.eliminatedAreas.length ?? 0)} · Selected components: {String(selectedRegions.length)}
          </Text>
        </Panel>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    gap: 6,
    paddingTop: 4
  },
  headerTitle: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800'
  },
  headerSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  scroll: {
    flex: 1
  },
  content: {
    gap: 16,
    padding: 16
  },
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
