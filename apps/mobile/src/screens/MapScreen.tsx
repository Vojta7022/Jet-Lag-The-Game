import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';
import { MapCanvas } from '../features/map/MapCanvas';

import {
  MapLegend,
  RegionSelectionList,
  buildMapOverlayModel,
  buildMapSetupBootstrapCommands,
  getSeedPlayableRegion,
  seedPlayableRegions
} from '../features/map/index.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function createMapRegionCommand(regionId: string): DomainCommand | undefined {
  const selectedRegion = getSeedPlayableRegion(regionId);
  if (!selectedRegion) {
    return undefined;
  }

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
  const [selectedRegionId, setSelectedRegionId] = useState(seedPlayableRegions[0]?.regionId);
  const activeMatch = state.activeMatch;
  const projection = activeMatch?.projection;
  const previewRegion = selectedRegionId ? getSeedPlayableRegion(selectedRegionId) : undefined;
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
  const canApplySelectedRegion = isHostView && projection?.lifecycleState === 'map_setup' && previewRegion;
  const mapHasBeenApplied = Boolean(projection?.visibleMap);
  const mapHeight = Math.max(320, Math.min(Math.round(dimensions.height * 0.4), 420));
  const regionSummary = projection?.visibleMap?.displayName ?? previewRegion?.displayName ?? 'No region selected';
  const candidateSummary = projection?.visibleMap?.remainingArea
    ? `${projection.visibleMap.remainingArea.precision} / clipped=${String(projection.visibleMap.remainingArea.clippedToRegion)}`
    : 'Pending region application';

  return (
    <View style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <Text style={styles.heroTitle}>Map</Text>
          <Text style={styles.heroSubtitle}>
            Player-facing geographic map with authoritative region boundaries, bounded candidate overlays, and visible seeker movement only where the current scope allows it.
          </Text>
        </View>
        <MapCanvas
          height={mapHeight}
          maxWidth={dimensions.width - 24}
          visibleMap={projection?.visibleMap}
          visibleMovementTracks={projection?.visibleMovementTracks}
          previewRegion={previewRegion}
        />
        <View style={styles.legendCard}>
          <MapLegend overlayModel={overlayModel} />
        </View>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
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

        <Panel title="Map Status">
          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Region</Text>
              <Text style={styles.metricValue}>{regionSummary}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Candidate</Text>
              <Text style={styles.metricValue}>{candidateSummary}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Constraint Layers</Text>
              <Text style={styles.metricValue}>{String(projection?.visibleMap?.constraintArtifacts.length ?? 0)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Visible Tracks</Text>
              <Text style={styles.metricValue}>{String(projection?.visibleMovementTracks.length ?? 0)}</Text>
            </View>
          </View>
          <Text style={styles.copy}>
            The candidate region always comes from the authoritative bounded search area. On iOS and Android this screen uses native map tiles; seeded boundaries are still the current selectable region source.
          </Text>
        </Panel>

        <Panel title="Region Actions">
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
              if (!canApplySelectedRegion || !selectedRegionId) {
                return;
              }

              const command = createMapRegionCommand(selectedRegionId);
              if (!command) {
                return;
              }

              void submitCommands([command]);
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
        </Panel>

        <Panel title="Selected Region">
          {previewRegion ? (
            <>
              <Text style={styles.title}>{previewRegion.displayName}</Text>
              <Text style={styles.copy}>{previewRegion.summary}</Text>
              <Text style={styles.copy}>Region kind: {previewRegion.regionKind}</Text>
              <Text style={styles.copy}>Feature datasets: {previewRegion.featureDatasetRefs.join(', ')}</Text>
            </>
          ) : (
            <Text style={styles.copy}>Select a region to preview its boundary.</Text>
          )}
        </Panel>

        <Panel title="Seed Regions">
          <RegionSelectionList
            regions={seedPlayableRegions}
            selectedRegionId={selectedRegionId}
            onSelect={setSelectedRegionId}
          />
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
  hero: {
    backgroundColor: colors.surface,
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    gap: 12,
    paddingHorizontal: 12,
    paddingBottom: 12,
    paddingTop: 12
  },
  heroHeader: {
    gap: 6,
    paddingHorizontal: 4
  },
  heroTitle: {
    color: colors.text,
    fontSize: 30,
    fontWeight: '800'
  },
  heroSubtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  legendCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12
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
  }
});
