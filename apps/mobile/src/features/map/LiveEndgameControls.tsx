import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../../providers/AppShellProvider.tsx';
import { useLocationSharing } from '../../providers/LocationSharingProvider.tsx';
import { AppButton } from '../../ui/AppButton.tsx';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

function formatSurvivalTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
}

export function LiveEndgameControls() {
  const { state, submitCommand } = useAppShell();
  const { state: locationState, requestForegroundPermission, captureCurrentPosition } = useLocationSharing();
  const projection = state.activeMatch?.projection;
  const viewerRole = state.activeMatch?.playerRole ?? state.activeMatch?.recipient.role;
  const isHost = state.activeMatch?.recipient.scope === 'host_admin' || viewerRole === 'host';
  const canActAsHider = viewerRole === 'hider' || isHost;
  const canActAsSeeker = viewerRole === 'seeker' || isHost;
  const [locationBusy, setLocationBusy] = useState(false);
  const [attestedSafeSpot, setAttestedSafeSpot] = useState(false);
  const [visuallyIdentified, setVisuallyIdentified] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>();

  if (!projection || !['seek_phase', 'endgame', 'game_complete'].includes(projection.lifecycleState)) {
    return null;
  }

  const capture = async () => {
    setLocationBusy(true);
    setStatusMessage(undefined);
    try {
      if (locationState.permissionState !== 'granted') {
        await requestForegroundPermission();
        setStatusMessage('Allow location access, then tap the action again to use one current GPS fix.');
        return undefined;
      }
      const point = await captureCurrentPosition();
      if (!point) {
        setStatusMessage('Could not get a GPS fix. Check location permission and try again.');
      }
      return point;
    } finally {
      setLocationBusy(false);
    }
  };

  const markFinalSpot = async () => {
    if (!attestedSafeSpot) {
      setStatusMessage('Confirm the spot is publicly accessible and within 3 m of a marked path.');
      return;
    }
    const point = await capture();
    if (!point) return;
    const saved = await submitCommand({
      type: 'set_final_hiding_spot',
      payload: {
        latitude: point.latitude,
        longitude: point.longitude,
        publiclyAccessible: true,
        within3mOfMarkedPath: true
      }
    });
    setStatusMessage(saved
      ? 'Final spot marked. You can still choose another spot until the seekers arrive on foot.'
      : 'The final spot could not be saved. Check the match status and try again.');
  };

  const reportSeekerPosition = async (onTransit: boolean) => {
    const point = await capture();
    if (!point) return;
    const saved = await submitCommand({
      type: 'update_location',
      payload: {
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters: point.accuracyMeters,
        source: point.source,
        onTransit
      }
    });
    setStatusMessage(!saved
      ? 'The seeker position could not be recorded. Check the match status and try again.'
      : onTransit
      ? 'Transit position recorded. Endgame starts after a seeker exits transit inside the zone.'
      : 'On-foot position recorded. If this is inside the hider zone, endgame has begun.');
  };

  const confirmFound = async () => {
    if (!visuallyIdentified) {
      setStatusMessage('Confirm that you can visually identify the hider first.');
      return;
    }
    const point = await capture();
    if (!point) return;
    const saved = await submitCommand({
      type: 'confirm_hider_found',
      payload: {
        latitude: point.latitude,
        longitude: point.longitude,
        visuallyIdentified: true
      }
    });
    if (!saved) setStatusMessage('The find could not be confirmed. Check that the GPS fix is within 2 m and try again.');
  };

  if (projection.lifecycleState === 'game_complete') {
    const result = projection.visibleRoundResults?.at(-1);
    const eligibleNextHiders = projection.players.filter((player) => player.role === 'seeker');
    const completedRoundCount = projection.visibleRoundResults?.length ?? 0;
    const nextHiderPlayerId = projection.hiderRotationOrder
      ? projection.hiderRotationOrder[completedRoundCount]
      : eligibleNextHiders[0]?.playerId;
    const nextHider = eligibleNextHiders.find((player) => player.playerId === nextHiderPlayerId);
    const rotationPlayers = (projection.hiderRotationOrder ?? [])
      .map((playerId) => projection.players.find((player) => player.playerId === playerId))
      .filter((player) => Boolean(player));
    return (
      <Panel title="Round secured" subtitle="The hider was found. The next round can begin here, within 10 minutes." tone="accent">
        <View style={styles.resultStamp}>
          <Text style={styles.resultTime}>{formatSurvivalTime(result?.finalHidingTimeSeconds ?? result?.survivalSeconds ?? 0)}</Text>
          <Text style={styles.resultCaption}>FINAL HIDING TIME</Text>
        </View>
        {result?.timeBonusSeconds ? (
          <Text style={styles.helper}>Includes {formatSurvivalTime(result.timeBonusSeconds)} from time bonuses held at capture.</Text>
        ) : null}
        {isHost ? (
          <View style={styles.actionGroup}>
            <Text style={styles.actionTitle}>{nextHider ? `Next up: ${nextHider.displayName}` : 'All hiding rounds complete'}</Text>
            <Text style={styles.helper}>The remaining hiding order was randomized when the match started. Each round begins where the previous hider was found; you have up to 10 minutes to prepare.</Text>
            {rotationPlayers.length > 0 ? (
              <View style={styles.rotationList}>
                {rotationPlayers.map((player, index) => (
                  <Text key={player!.playerId} style={index === completedRoundCount ? styles.rotationNext : styles.rotationPlayer}>
                    {String(index + 1).padStart(2, '0')}  {player!.displayName}{index === completedRoundCount ? '  · NEXT' : ''}
                  </Text>
                ))}
              </View>
            ) : null}
            {nextHider ? (
              <AppButton
                label={`Start next round · ${nextHider.displayName} hides`}
                onPress={() => {
                void submitCommand({
                  type: 'start_next_round',
                  payload: { nextHiderPlayerId: nextHider.playerId }
                }).then((saved) => setStatusMessage(saved
                  ? `${nextHider.displayName} is the hider. The new hide timer is running.`
                  : 'The next round could not start. Check that the 10-minute planning window is still open.'));
              }}
              />
            ) : null}
          </View>
        ) : (
          <Text style={styles.helper}>The referee is choosing the next hider. The next round starts from this found spot.</Text>
        )}
        {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
      </Panel>
    );
  }

  return (
    <Panel
      title={projection.lifecycleState === 'endgame' ? 'Final approach' : 'Field actions'}
      subtitle={projection.lifecycleState === 'endgame'
        ? 'The hider is holding their final spot. Get within 2 m and confirm you can see them.'
        : 'Use a single GPS fix when you take an action. The hider chooses a safe final spot before seekers arrive.'}
      tone={projection.lifecycleState === 'endgame' ? 'accent' : 'soft'}
    >
      {projection.lifecycleState === 'seek_phase' && canActAsHider ? (
        <View style={styles.actionGroup}>
          <Text style={styles.actionTitle}>Choose your final hideout</Text>
          <Text style={styles.helper}>Pick a public place beside a marked path. Your pin stays private from seekers until the hider is found.</Text>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: attestedSafeSpot }}
            onPress={() => setAttestedSafeSpot((value) => !value)}
            style={styles.attestation}
          >
            <View style={[styles.checkBox, attestedSafeSpot ? styles.checkBoxSelected : null]}>
              {attestedSafeSpot ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.attestationText}>Publicly accessible and within 3 m of a marked path</Text>
          </Pressable>
          <AppButton
            label={locationBusy ? 'Getting a GPS fix…' : projection.hiddenState?.finalHidingSpot ? 'Move final spot to here' : 'Mark this spot as my hideout'}
            onPress={() => void markFinalSpot()}
            disabled={locationBusy}
            tone="primary"
          />
          {projection.hiddenState?.finalHidingSpot ? <Text style={styles.savedNote}>Final spot saved. It remains hidden from seekers.</Text> : null}
        </View>
      ) : null}

      {projection.lifecycleState === 'seek_phase' && canActAsSeeker ? (
        <View style={styles.actionGroup}>
          <Text style={styles.actionTitle}>Where are the seekers?</Text>
          <View style={styles.buttonRow}>
            <AppButton label="On transit" onPress={() => void reportSeekerPosition(true)} disabled={locationBusy} tone="secondary" />
            <AppButton label="On foot" onPress={() => void reportSeekerPosition(false)} disabled={locationBusy} tone="primary" />
          </View>
        </View>
      ) : null}

      {projection.lifecycleState === 'endgame' && canActAsHider ? (
        <Text style={styles.hiderStatus}>Stay at your marked spot until the seekers find you.</Text>
      ) : null}

      {projection.lifecycleState === 'endgame' && canActAsSeeker ? (
        <View style={styles.actionGroup}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: visuallyIdentified }}
            onPress={() => setVisuallyIdentified((value) => !value)}
            style={styles.attestation}
          >
            <View style={[styles.checkBox, visuallyIdentified ? styles.checkBoxSelected : null]}>
              {visuallyIdentified ? <Text style={styles.checkMark}>✓</Text> : null}
            </View>
            <Text style={styles.attestationText}>I can visually identify the hider</Text>
          </Pressable>
          <AppButton
            label={locationBusy ? 'Checking your position…' : 'Confirm we found the hider'}
            onPress={() => void confirmFound()}
            disabled={locationBusy}
            tone="primary"
          />
        </View>
      ) : null}

      {statusMessage ? <Text accessibilityLiveRegion="polite" style={styles.status}>{statusMessage}</Text> : null}
      {locationState.errorMessage ? <Text style={styles.error}>{locationState.errorMessage}</Text> : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  actionGroup: { gap: 10 },
  actionTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  helper: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  attestation: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingVertical: 7 },
  checkBox: { alignItems: 'center', borderColor: colors.border, borderRadius: 6, borderWidth: 2, height: 24, justifyContent: 'center', width: 24 },
  checkBoxSelected: { backgroundColor: colors.signal, borderColor: colors.signal },
  checkMark: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  attestationText: { color: colors.ink, flex: 1, fontSize: 14, fontWeight: '700' },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  savedNote: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  hiderStatus: { backgroundColor: colors.surface, borderRadius: 14, color: colors.ink, fontSize: 15, fontWeight: '800', padding: 14 },
  resultStamp: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.signal, borderRadius: 16, paddingHorizontal: 18, paddingVertical: 12 },
  resultTime: { color: colors.ink, fontSize: 28, fontVariant: ['tabular-nums'], fontWeight: '900' },
  resultCaption: { color: colors.ink, fontSize: 10, fontWeight: '900', letterSpacing: 1.3 },
  rotationList: { backgroundColor: colors.surface, borderRadius: 14, gap: 8, padding: 12 },
  rotationPlayer: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
  rotationNext: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  status: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
  error: { color: colors.danger, fontSize: 13, fontWeight: '700' }
});
