import { router } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import {
  buildRoleAssignmentCommands,
  getAssignablePlayers,
  hasRequiredRoleAssignments,
  isRoleAssignmentStage
} from '../features/roles/role-assignment.ts';
import { shouldRedirectSetupScreen } from '../navigation/player-flow.ts';
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
  const primaryNextRoute = rolesReady || projection?.visibleMap ? '/map' : '/dashboard';
  const primaryNextLabel = rolesReady || projection?.visibleMap ? 'Continue To Map Setup' : 'Open Team View';

  useEffect(() => {
    if (shouldRedirectSetupScreen(projection?.lifecycleState)) {
      router.replace('/map');
    }
  }, [projection?.lifecycleState]);

  return (
    <ScreenContainer
      title="Match Room"
      eyebrow="Pregame"
      subtitle="See who is in the match, confirm your current view, and move into the next step of play."
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
          title="Match Overview"
          subtitle="This summary comes from the current live match view on this device."
        >
          <FactList
            items={[
              { label: 'Stage', value: state.activeMatch.lifecycleState },
              { label: 'Role', value: roleLabel },
              {
                label: 'Your View',
                value: state.activeMatch.recipient.scope
                  .replace(/_/g, ' ')
                  .replace(/\b\w/g, (character) => character.toUpperCase())
              },
              { label: 'Visible Players', value: String(projection?.players.length ?? 0) },
              { label: 'Visible Teams', value: String(projection?.teams.length ?? 0) }
            ]}
          />
          <AppButton
            label="Refresh Lobby"
            onPress={() => {
              void refreshActiveMatch();
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
          subtitle="Assign one hider and at least one seeker before moving into map setup."
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
                    <Text style={styles.label}>{player.displayName}</Text>
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
          title="Visible Players"
          subtitle="Only players visible to the current match view appear here."
        >
          {projection.players.length === 0 ? <Text style={styles.copy}>No players are visible yet.</Text> : null}
          {projection.players.map((player) => (
            <View key={player.playerId} style={styles.row}>
              <Text style={styles.label}>{player.displayName}</Text>
              <Text style={styles.value}>{player.role || 'role hidden'}</Text>
            </View>
          ))}
        </Panel>
      ) : null}

      {projection ? (
        <Panel
          title="Next Step"
          subtitle="Keep setup linear: finish teams, continue to map setup, then start the live game."
        >
          <AppButton label={primaryNextLabel} onPress={() => router.push(primaryNextRoute)} />
          {role === 'host' ? (
            <AppButton label="Open Match Controls" onPress={() => router.push('/status')} tone="ghost" />
          ) : null}
        </Panel>
      ) : null}
    </ScreenContainer>
  );
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
