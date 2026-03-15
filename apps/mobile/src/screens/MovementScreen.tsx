import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { MapCanvas } from '../features/map/MapCanvas';

import {
  buildMovementTrackViewModels,
  canViewerShareLiveLocation,
  LocationControlsPanel,
  LocationStatusPanel,
  MovementHistoryPanel,
  resolveLocationViewerRole
} from '../features/location/index.ts';
import { getSeedPlayableRegion } from '../features/map/index.ts';
import { useLocationSharing } from '../providers/LocationSharingProvider.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function MovementScreen() {
  const { state: appShellState, refreshActiveMatch } = useAppShell();
  const {
    state: locationState,
    clearError,
    refreshPermissionState,
    requestForegroundPermission,
    selectFrequencyMode,
    sendSingleUpdate,
    startSharing,
    stopSharing
  } = useLocationSharing();

  const activeMatch = appShellState.activeMatch;
  const projection = activeMatch?.projection;
  const viewerRole = resolveLocationViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const canShare = canViewerShareLiveLocation(viewerRole);
  const movementTracks = useMemo(
    () => buildMovementTrackViewModels(projection),
    [projection]
  );
  const fallbackPreviewRegion = projection?.visibleMap?.regionId
    ? getSeedPlayableRegion(projection.visibleMap.regionId)
    : undefined;

  return (
    <ScreenContainer
      title="Movement"
      subtitle="First-pass live-location controls and bounded movement overlays wired to the real update_location command."
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first. Movement sharing only works through an active runtime session."
        />
      ) : null}

      {activeMatch && !canShare ? (
        <StateBanner
          tone="info"
          title="Read-only movement view"
          detail="Only seeker and host-admin views can send location updates in this first phase. Other roles can only inspect movement data that the current projection allows."
        />
      ) : null}

      {locationState.permissionState === 'denied' ? (
        <StateBanner
          tone="warning"
          title="Location permission denied"
          detail="The shell will not pretend sharing is active. Grant foreground access before sending live updates."
        />
      ) : null}

      {locationState.permissionState === 'unavailable' ? (
        <StateBanner
          tone="warning"
          title="Location unavailable"
          detail="This runtime does not currently expose device location services. You can still inspect already-visible movement history from the projection."
        />
      ) : null}

      <Panel title="Location Status">
        <LocationStatusPanel
          state={locationState}
          viewerRole={viewerRole}
          canShare={canShare}
        />
      </Panel>

      <Panel title="Sharing Controls">
        <LocationControlsPanel
          state={locationState}
          disabled={!activeMatch || appShellState.loadState === 'loading'}
          canShare={canShare}
          onRefreshPermission={() => {
            void refreshPermissionState();
          }}
          onRequestPermission={() => {
            void requestForegroundPermission();
          }}
          onSelectFrequencyMode={selectFrequencyMode}
          onSendSingleUpdate={() => {
            void sendSingleUpdate();
          }}
          onStartSharing={() => {
            void startSharing();
          }}
          onStopSharing={() => {
            void stopSharing();
          }}
          onClearError={clearError}
        />
      </Panel>

      <Panel title="Movement Map">
        <MapCanvas
          height={300}
          visibleMap={projection?.visibleMap}
          visibleMovementTracks={projection?.visibleMovementTracks}
          previewRegion={fallbackPreviewRegion}
        />
        <Text style={styles.copy}>
          The map renders projected non-hider movement tracks on the same geographic surface as the active playable region. Hidden hider coordinates stay out of these overlays even when the authority stores them.
        </Text>
        <AppButton
          label="Refresh Movement Projection"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || appShellState.loadState === 'loading'}
        />
      </Panel>

      <Panel title="Visible Movement History">
        <MovementHistoryPanel tracks={movementTracks} />
      </Panel>

      <Panel title="Projection Summary">
        <View style={styles.row}>
          <Text style={styles.label}>Visible Tracks</Text>
          <Text style={styles.value}>{String(movementTracks.length)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Visible Samples</Text>
          <Text style={styles.value}>{String(movementTracks.reduce((sum, track) => sum + track.sampleCount, 0))}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>Lifecycle</Text>
          <Text style={styles.value}>
            {projection?.lifecycleState}
            {projection?.seekPhaseSubstate ? ` / ${projection.seekPhaseSubstate}` : ''}
          </Text>
        </View>
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
