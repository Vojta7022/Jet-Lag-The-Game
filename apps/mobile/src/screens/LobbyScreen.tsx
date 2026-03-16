import { router } from 'expo-router';
import { useEffect } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import {
  buildRoleAssignmentCommands,
  getAssignablePlayers,
  hasRequiredRoleAssignments,
  isRoleAssignmentStage
} from '../features/roles/role-assignment.ts';
import { formatLifecycleLabel, shouldRedirectSetupScreen } from '../navigation/player-flow.ts';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function LobbyScreen() {
  const { state, refreshActiveMatch, submitCommand, submitCommands } = useAppShell();
  const projection = state.activeMatch?.projection;
  const role = state.activeMatch?.playerRole ?? state.activeMatch?.recipient.role ?? 'spectator';
  const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const canManageRoles = Boolean(role === 'host' && projection && isRoleAssignmentStage(projection.lifecycleState));
  const assignablePlayers = getAssignablePlayers(projection);
  const rolesReady = hasRequiredRoleAssignments(projection);
  const currentPlayerId = state.activeMatch?.recipient.playerId;
  const onlineJoinCode = state.activeMatch?.runtimeKind === 'online_foundation' ? state.activeMatch.joinCode : undefined;
  const primaryNextRoute = liveGameplayState ? '/map' : rolesReady || projection?.visibleMap ? '/map' : '/dashboard';
  const primaryNextLabel = liveGameplayState
    ? 'Go To Live Map'
    : rolesReady || projection?.visibleMap
      ? 'Continue To Map Setup'
      : 'Open Teams';
  const roomStatusTitle = !projection
    ? 'Waiting for room state'
    : liveGameplayState
      ? 'Live play is ready'
      : !rolesReady
        ? canManageRoles
          ? 'Choose teams'
          : 'Waiting for teams'
        : projection.visibleMap
          ? 'Playable area is ready'
          : 'Continue to map setup';
  const roomStatusDetail = !projection
    ? 'Connect to a match first.'
    : liveGameplayState
      ? 'Setup is complete. The normal player path now continues on the live map.'
      : !rolesReady
        ? canManageRoles
          ? 'Pick one hider and at least one seeker, then continue into map setup.'
          : 'The host is still choosing the hider and seeker sides for this match.'
        : projection.visibleMap
          ? 'Teams are locked in and the playable area is applied. The host can finish setup from map setup.'
          : 'Teams are ready. The next step is choosing and applying the playable area.';

  useEffect(() => {
    if (shouldRedirectSetupScreen(projection?.lifecycleState)) {
      router.replace('/map');
    }
  }, [projection?.lifecycleState]);

  return (
    <ScreenContainer
      title="Match Room"
      eyebrow="Pregame"
      subtitle="Share the join code, choose teams, and move into map setup."
      topSlot={<ProductNavBar current="lobby" />}
    >
      {!state.activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first, then return here to review the current lobby state."
        />
      ) : null}

      {state.activeMatch ? (
        <Panel
          title="Pregame Status"
          subtitle={roomStatusDetail}
        >
          <FactList
            items={[
              { label: 'Current Step', value: roomStatusTitle },
              { label: 'Your Role', value: roleLabel },
              { label: 'Match Stage', value: formatLifecycleLabel(state.activeMatch.lifecycleState) },
              { label: 'Game Size', value: formatScaleLabel(projection?.selectedScale) },
              { label: 'Playable Area', value: projection?.visibleMap?.displayName ?? 'Not applied yet' }
            ]}
          />
          <AppButton label={primaryNextLabel} onPress={() => router.push(primaryNextRoute)} />
          <AppButton
            label="Refresh Room"
            tone="ghost"
            onPress={() => {
              void refreshActiveMatch();
            }}
          />
        </Panel>
      ) : null}

      {onlineJoinCode ? (
        <Panel
          title="Join Code"
          subtitle="Share this short code with other players so they can join from their own devices."
          tone="accent"
        >
          <Text selectable style={styles.joinCodeValue}>{onlineJoinCode}</Text>
          <AppButton
            label="Share Join Code"
            tone="secondary"
            onPress={() => {
              void Share.share({
                message: `Join my match in Transit Hide and Seek with code ${onlineJoinCode}.`
              });
            }}
          />
        </Panel>
      ) : null}

      {projection && liveGameplayState ? (
        <StateBanner
          tone="info"
          title="Sending you back to the live map"
          detail="Team assignment and setup are complete. Match Room is no longer part of the normal player path once live play begins."
        />
      ) : null}

      {projection && canManageRoles ? (
        <Panel
          title="Choose Teams"
          subtitle="Assign one hider and at least one seeker before moving into map setup. The host can also join either side."
        >
          {assignablePlayers.length === 0 ? (
            <StateBanner
              tone="warning"
              title="Players still need to join"
              detail="Wait for players to join the room, then place one player on the hider side and the others on the seeker side."
            />
          ) : (
            <>
              {assignablePlayers.map((player) => (
                <View key={player.playerId} style={styles.assignmentCard}>
                  <View style={styles.assignmentHeader}>
                    <Text style={styles.label}>
                      {player.displayName}
                      {player.playerId === currentPlayerId ? ' (You)' : ''}
                    </Text>
                    <Text style={styles.assignmentRole}>
                      {player.role ? formatVisibleRole(player.role) : 'Unassigned'}
                    </Text>
                  </View>
                  <View style={styles.assignmentActions}>
                    <AppButton
                      label={player.role === 'hider' ? 'Hider Selected' : 'Make Hider'}
                      tone={player.role === 'hider' ? 'secondary' : 'primary'}
                      disabled={state.loadState === 'loading'}
                      onPress={() => {
                        void submitCommands(buildRoleAssignmentCommands(projection, player.playerId, 'hider'));
                      }}
                    />
                    <AppButton
                      label={player.role === 'seeker' ? 'Seeker Selected' : 'Make Seeker'}
                      tone="secondary"
                      disabled={state.loadState === 'loading'}
                      onPress={() => {
                        void submitCommands(buildRoleAssignmentCommands(projection, player.playerId, 'seeker'));
                      }}
                    />
                  </View>
                </View>
              ))}
              {!rolesReady ? (
                <StateBanner
                  tone="warning"
                  title="Teams still need one hider and one seeker"
                  detail="Choose exactly who will hide, then make sure at least one joined player stays on the seeker side."
                />
              ) : null}
              <AppButton
                label={state.loadState === 'loading' ? 'Saving Teams...' : 'Confirm Teams'}
                disabled={!rolesReady || state.loadState === 'loading'}
                onPress={() => {
                  void submitCommand({
                    type: 'confirm_roles',
                    payload: {}
                  });
                }}
              />
            </>
          )}
        </Panel>
      ) : null}

      {projection && isRoleAssignmentStage(projection.lifecycleState) && !canManageRoles ? (
        <StateBanner
          tone="info"
          title="Waiting for team assignment"
          detail="The host is still assigning the hider and seeker sides for this match."
        />
      ) : null}

      {projection ? (
        <Panel
          title="Players In Room"
          subtitle="Everyone currently visible in this match room appears here."
        >
          {projection.players.length === 0 ? <Text style={styles.copy}>No players are visible yet.</Text> : null}
          {projection.players.map((player) => (
            <View key={player.playerId} style={styles.row}>
              <Text style={styles.label}>
                {player.displayName}
                {player.playerId === currentPlayerId ? ' (You)' : ''}
              </Text>
              <Text style={styles.value}>{player.role || 'role hidden'}</Text>
            </View>
          ))}
        </Panel>
      ) : null}

      {projection && role === 'host' ? (
        <AppButton label="Open Match Controls" onPress={() => router.push('/status')} tone="ghost" />
      ) : null}
    </ScreenContainer>
  );
}

function formatScaleLabel(scale: 'small' | 'medium' | 'large' | undefined) {
  switch (scale) {
    case 'small':
      return 'Small';
    case 'medium':
      return 'Medium';
    case 'large':
      return 'Large';
    default:
      return 'Waiting for match size';
  }
}

const styles = StyleSheet.create({
  assignmentCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 12
  },
  assignmentHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  assignmentActions: {
    gap: 8
  },
  assignmentRole: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  joinCodeValue: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 4,
    textAlign: 'center'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  value: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'right'
  }
});

function formatVisibleRole(role: string) {
  return role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
