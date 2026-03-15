import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { DomainCommand } from '../../../../packages/shared-types/src/index.ts';

import {
  MapCanvas,
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
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
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

  return (
    <ScreenContainer
      title="Map Setup"
      subtitle="First-pass bounded region selection wired to the real create_map_region command and the existing search-area projection."
    >
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

      <Panel title="Map Canvas">
        <MapCanvas
          visibleMap={projection?.visibleMap}
          visibleMovementTracks={projection?.visibleMovementTracks}
          previewRegion={previewRegion}
        />
        <MapLegend overlayModel={overlayModel} />
        <Text style={styles.copy}>
          The candidate region is always taken from the authoritative bounded search area. Visible seeker breadcrumbs are layered on the same bounded surface when the current scope permits them.
        </Text>
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

      {projection?.visibleMap ? (
        <Panel title="Applied Match Region">
          <View style={styles.row}>
            <Text style={styles.label}>Region</Text>
            <Text style={styles.value}>{projection.visibleMap.displayName}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Kind</Text>
            <Text style={styles.value}>{projection.visibleMap.regionKind}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Candidate Area</Text>
            <Text style={styles.value}>
              {projection.visibleMap.remainingArea?.precision ?? 'none'} / clipped={String(projection.visibleMap.remainingArea?.clippedToRegion ?? false)}
            </Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Eliminated Layers</Text>
            <Text style={styles.value}>{String(projection.visibleMap.eliminatedAreas.length)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Constraint Layers</Text>
            <Text style={styles.value}>{String(projection.visibleMap.constraintArtifacts.length)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Visible Movement Tracks</Text>
            <Text style={styles.value}>{String(projection.visibleMovementTracks.length)}</Text>
          </View>
        </Panel>
      ) : null}

      <Panel title="Seed Regions">
        <RegionSelectionList
          regions={seedPlayableRegions}
          selectedRegionId={selectedRegionId}
          onSelect={setSelectedRegionId}
        />
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
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  }
});
