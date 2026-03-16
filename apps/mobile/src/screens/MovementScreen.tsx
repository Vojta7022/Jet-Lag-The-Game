import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
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
import { canAccessHostControls } from '../navigation/player-flow.ts';
import {
  MatchTimingBanner,
  MatchTimingPanel,
  useMatchTimingModel
} from '../features/timers/index.ts';
import { useLocationSharing } from '../providers/LocationSharingProvider.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
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
  const timingModel = useMatchTimingModel(projection, activeMatch?.receivedAt);
  const viewerRole = resolveLocationViewerRole(activeMatch?.playerRole, activeMatch?.recipient.scope);
  const canShare = canViewerShareLiveLocation(viewerRole);
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );
  const movementTracks = useMemo(
    () => buildMovementTrackViewModels(projection),
    [projection]
  );
  const fallbackPreviewRegion = projection?.visibleMap?.regionId
    ? getSeedPlayableRegion(projection.visibleMap.regionId)
    : undefined;

  return (
    <ScreenContainer
      title="Movement Review"
      eyebrow="Host Only"
      subtitle="Use this as an advanced movement review screen. Normal live play should stay on the map."
      topSlot={<ProductNavBar current="movement" />}
    >
      {activeMatch ? (
        <Panel
          title="Return To Live Play"
          subtitle="Visible movement now belongs on the main map. Use this screen only when you need deeper review or sharing controls."
          tone="soft"
        >
          <AppButton label="Back To Live Map" onPress={() => router.push('/map')} tone="secondary" />
          {canOpenMatchControls ? (
            <AppButton label="Open Match Controls" onPress={() => router.push('/status')} tone="ghost" />
          ) : null}
        </Panel>
      ) : null}

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

      <MatchTimingBanner model={timingModel} />

      {activeMatch ? (
        <Panel
          title="Match Timing"
          subtitle="Movement sharing stays in step with hide phase, cooldowns, and pause state."
        >
          <MatchTimingPanel model={timingModel} />
        </Panel>
      ) : null}

      <Panel
        title="Location Status"
        subtitle="Current permission, device availability, and sharing state."
      >
        <LocationStatusPanel
          state={locationState}
          viewerRole={viewerRole}
          canShare={canShare}
        />
      </Panel>

      <Panel
        title="Sharing Controls"
        subtitle="Start or stop updates, request permission, and choose a simple update frequency."
      >
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

      <Panel
        title="Movement Map"
        subtitle="Visible seeker paths are rendered on the playable map while protected hider coordinates stay hidden."
      >
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
          label="Refresh Movement"
          onPress={() => {
            void refreshActiveMatch();
          }}
          tone="secondary"
          disabled={!activeMatch || appShellState.loadState === 'loading'}
        />
      </Panel>

      <Panel
        title="Visible Movement History"
        subtitle="Recent visible movement samples from the active projection."
      >
        <MovementHistoryPanel tracks={movementTracks} />
      </Panel>

      <Panel
        title="Movement Summary"
        subtitle="A quick view of what the current scope can see."
      >
        <FactList
          items={[
            { label: 'Role', value: viewerRole },
            { label: 'Visible Tracks', value: movementTracks.length },
            {
              label: 'Visible Samples',
              value: movementTracks.reduce((sum, track) => sum + track.sampleCount, 0)
            },
            {
              label: 'Stage',
              value: projection?.seekPhaseSubstate
                ? `${projection.lifecycleState} / ${projection.seekPhaseSubstate}`
                : projection?.lifecycleState ?? 'Unavailable'
            }
          ]}
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
});
