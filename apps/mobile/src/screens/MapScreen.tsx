import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';
import { MapCanvas } from '../features/map/MapCanvas';
import type { PlayableRegionCatalogEntry } from '../features/map/index.ts';

import {
  MapLegend,
  SearchableRegionPicker,
  buildMapOverlayModel,
  buildMapSetupBootstrapCommands,
  mobileRegionDataSource,
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
  const regionSearch = useRegionSearch({
    source: mobileRegionDataSource
  });
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const previewRegion = regionSearch.selectedRegion;
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
  const canApplySelectedRegion = isHostView && projection?.lifecycleState === 'map_setup' && Boolean(previewRegion);
  const mapHasBeenApplied = Boolean(projection?.visibleMap);
  const mapHeight = Math.max(190, Math.min(Math.round(dimensions.height * 0.24), 250));
  const regionSummary = projection?.visibleMap?.displayName ?? previewRegion?.displayName ?? 'No region selected';
  const candidateSummary = projection?.visibleMap?.remainingArea
    ? `${projection.visibleMap.remainingArea.precision} / clipped=${String(projection.visibleMap.remainingArea.clippedToRegion)}`
    : 'Pending region application';

  return (
    <View style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Map Setup</Text>
          <Text style={styles.headerSubtitle}>
            Search for a playable city or administrative region first, then preview and apply its bounded boundary through the real runtime flow.
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
            detail="Selecting a region now will trigger create_map_region and reinitialize the candidate search area from that boundary."
          />
        ) : null}

        <Panel title="Search Regions">
          <SearchableRegionPicker
            query={regionSearch.query}
            minimumQueryLengthMet={regionSearch.minimumQueryLengthMet}
            results={regionSearch.regions}
            selectedRegionId={regionSearch.selectedRegionId}
            sourceLabel={regionSearch.sourceLabel}
            usingFallback={regionSearch.usingFallback}
            noticeMessage={regionSearch.noticeMessage}
            isLoading={regionSearch.isLoading}
            errorMessage={regionSearch.errorMessage}
            onChangeQuery={regionSearch.setQuery}
            onRetry={regionSearch.retrySearch}
            onSelect={(regionId) => {
              void regionSearch.selectRegion(regionId);
            }}
          />
        </Panel>

        <Panel title="Selected Region">
          {previewRegion ? (
            <View style={styles.selectedSection}>
              <View style={styles.selectedHeader}>
                <View style={styles.selectedTextBlock}>
                  <Text style={styles.title}>{previewRegion.displayName}</Text>
                  <Text style={styles.copy}>{previewRegion.summary}</Text>
                </View>
                <View style={styles.selectedBadge}>
                  <Text style={styles.selectedBadgeLabel}>{previewRegion.regionKind}</Text>
                </View>
              </View>

              <View style={styles.metricGrid}>
                <View style={styles.metricCard}>
                  <Text style={styles.metricLabel}>Provider</Text>
                  <Text style={styles.metricValue}>{previewRegion.sourceLabel}</Text>
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
                  <Text style={styles.metricLabel}>Visible Tracks</Text>
                  <Text style={styles.metricValue}>{String(projection?.visibleMovementTracks.length ?? 0)}</Text>
                </View>
              </View>

              {previewRegion.countryLabel ? (
                <Text style={styles.copy}>
                  Coverage: {previewRegion.countryLabel}
                  {previewRegion.parentRegionLabel && previewRegion.parentRegionLabel !== previewRegion.displayName
                    ? ` · ${previewRegion.parentRegionLabel}`
                    : ''}
                </Text>
              ) : null}
              <Text style={styles.copy}>Feature datasets: {previewRegion.featureDatasetRefs.join(', ')}</Text>
            </View>
          ) : (
            <StateBanner
              tone="info"
              title="No region selected yet"
              detail="Use the search panel above to preview a real administrative boundary before applying it to the match."
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
              label={mapHasBeenApplied ? 'Replace Playable Region' : 'Apply Selected Region'}
              onPress={() => {
                if (!canApplySelectedRegion || !previewRegion) {
                  return;
                }

                void submitCommands([createMapRegionCommand(previewRegion)]);
              }}
              disabled={!canApplySelectedRegion || state.loadState === 'loading'}
              tone="secondary"
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
                The map preview is secondary during setup: it shows the selected playable boundary and the current bounded candidate area without crowding the search workflow.
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
            Constraint layers: {String(projection?.visibleMap?.constraintArtifacts.length ?? 0)} · Eliminated areas: {String(projection?.visibleMap?.eliminatedAreas.length ?? 0)}
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
