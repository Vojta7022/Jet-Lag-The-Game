import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Share, StyleSheet, Text, View } from 'react-native';

import { isLiveGameplayState } from '../components/gameplay-nav-model.ts';
import {
  buildRoleAssignmentCommands,
  getAssignablePlayers,
  hasRequiredRoleAssignments,
  isRoleAssignmentStage
} from '../features/roles/role-assignment.ts';
import {
  canAccessHostControls,
  shouldRedirectSetupScreen
} from '../navigation/player-flow.ts';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors, fonts } from '../ui/theme.ts';
import { GameIcon } from '../ui/GameIcon.tsx';
import { Field } from '../ui/Field.tsx';
import { createUuid } from '../runtime/create-uuid.ts';

export function LobbyScreen() {
  const { state, refreshActiveMatch, submitCommand, submitCommands } =
    useAppShell();
  const [crewName, setCrewName] = useState('');
  const projection = state.activeMatch?.projection;
  const role = canAccessHostControls(
    state.activeMatch?.playerRole ?? state.activeMatch?.recipient.role,
    state.activeMatch?.recipient.scope
  )
    ? 'host'
    : (state.activeMatch?.playerRole ??
      state.activeMatch?.recipient.role ??
      'spectator');
  const liveGameplayState = isLiveGameplayState(projection?.lifecycleState);
  const canManageRoles = Boolean(
    role === 'host' &&
      projection &&
      isRoleAssignmentStage(projection.lifecycleState)
  );
  const assignablePlayers = getAssignablePlayers(projection);
  const rolesReady = hasRequiredRoleAssignments(projection);
  const currentPlayerId = state.activeMatch?.recipient.playerId;
  const onlineJoinCode =
    state.activeMatch?.runtimeKind === 'online_foundation'
      ? state.activeMatch.joinCode
      : undefined;
  const primaryNextRoute = liveGameplayState
    ? '/map'
    : rolesReady || projection?.visibleMap
      ? '/map'
      : '/dashboard';
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

  useFocusEffect(useCallback(() => {
    if (shouldRedirectSetupScreen(projection?.lifecycleState)) {
      router.replace('/map');
    }
  }, [projection?.lifecycleState]));

  return (
    <ScreenContainer
      title="Meet your crew"
      eyebrow="NEXT STOP · THE BRIEFING"
      subtitle="Every great escape needs a good team. Who’s hiding, and who’s hunting?"
      topSlot={<ProductNavBar current="lobby" />}
    >
      {state.errorMessage ? (
        <StateBanner
          tone="error"
          title="Couldn’t update your crew"
          detail={state.errorMessage}
        />
      ) : null}
      {!state.activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first, then return here to review the current lobby state."
        />
      ) : null}

      {projection ? (
        <View style={styles.teamBoard}>
          {(['hider', 'seeker'] as const).map((side) => {
            const players = projection.players.filter(
              (player) => player.role === side
            );
            const color = side === 'hider' ? colors.hider : colors.seeker;
            return (
              <View
                key={side}
                style={[styles.teamSpace, { borderTopColor: color }]}
              >
                <View style={styles.teamHeading}>
                  <GameIcon name={side} color={color} size={28} />
                  <Text style={[styles.teamCount, { color }]}>
                    {String(players.length).padStart(2, '0')}
                  </Text>
                </View>
                <Text style={styles.teamTitle}>
                  {side === 'hider' ? 'The Hider' : 'The Seekers'}
                </Text>
                <Text style={styles.teamMotto}>
                  {side === 'hider'
                    ? 'Disappear into the city.'
                    : 'Leave no clue behind.'}
                </Text>
                <View style={styles.teamRoster}>
                  {players.length ? (
                    players.map((player) => (
                      <Text key={player.playerId} style={styles.teamPlayer}>
                        {player.displayName}
                      </Text>
                    ))
                  ) : (
                    <Text style={styles.teamEmpty}>Waiting for your crew</Text>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {state.activeMatch ? (
        <Panel title="Ready for the adventure?" subtitle={roomStatusDetail}>
          <View style={styles.briefing}>
            <Text style={styles.briefingLabel}>YOUR NEXT MOVE</Text>
            <Text style={styles.briefingTitle}>{roomStatusTitle}</Text>
            <Text style={styles.copy}>
              {formatScaleLabel(projection?.selectedScale)} game ·{' '}
              {projection?.visibleMap?.displayName ??
                'Choose your playing field next'}
            </Text>
          </View>
          <AppButton
            label={primaryNextLabel}
            onPress={() => router.push(primaryNextRoute)}
          />
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
          title="Your crew’s boarding pass"
          subtitle="Share this short code with other players so they can join from their own devices."
          tone="accent"
        >
          <Text selectable style={styles.joinCodeValue}>
            {onlineJoinCode}
          </Text>
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
          title="Who’s playing which side?"
          subtitle="Assign one hider and at least one seeker before moving into map setup. The host can also join either side."
        >
          {state.activeMatch?.runtimeKind === 'single_device_referee' ? (
            <View style={styles.addCrew}>
              <Field
                label="Add someone to the crew"
                placeholder="Player name"
                autoCapitalize="words"
                value={crewName}
                onChangeText={setCrewName}
              />
              <AppButton
                label="Add player  +"
                tone="secondary"
                disabled={!crewName.trim() || state.loadState === 'loading'}
                onPress={() => {
                  void submitCommand({
                    type: 'join_match',
                    payload: {
                      playerId: `local-${createUuid()}`,
                      displayName: crewName.trim()
                    }
                  }).then((accepted) => {
                    if (accepted) setCrewName('');
                  });
                }}
              />
            </View>
          ) : null}
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
                      {player.role
                        ? formatVisibleRole(player.role)
                        : 'Unassigned'}
                    </Text>
                  </View>
                  <View style={styles.assignmentActions}>
                    <AppButton
                      label={
                        player.role === 'hider'
                          ? 'Hider Selected'
                          : 'Make Hider'
                      }
                      tone={player.role === 'hider' ? 'secondary' : 'primary'}
                      disabled={state.loadState === 'loading'}
                      onPress={() => {
                        void submitCommands(
                          buildRoleAssignmentCommands(
                            projection,
                            player.playerId,
                            'hider'
                          )
                        );
                      }}
                    />
                    <AppButton
                      label={
                        player.role === 'seeker'
                          ? 'Seeker Selected'
                          : 'Make Seeker'
                      }
                      tone="secondary"
                      disabled={state.loadState === 'loading'}
                      onPress={() => {
                        void submitCommands(
                          buildRoleAssignmentCommands(
                            projection,
                            player.playerId,
                            'seeker'
                          )
                        );
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
                label={
                  state.loadState === 'loading'
                    ? 'Saving Teams...'
                    : 'Confirm Teams'
                }
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

      {projection &&
      isRoleAssignmentStage(projection.lifecycleState) &&
      !canManageRoles ? (
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
          {projection.players.length === 0 ? (
            <Text style={styles.copy}>No players are visible yet.</Text>
          ) : null}
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
        <AppButton
          label="Open Match Controls"
          onPress={() => router.push('/status')}
          tone="ghost"
        />
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
  addCrew: {
    gap: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  teamBoard: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  teamSpace: {
    flex: 1,
    minWidth: 140,
    borderTopWidth: 5,
    backgroundColor: colors.surfaceRaised,
    padding: 20,
    borderRadius: 12,
    gap: 10
  },
  teamHeading: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  teamCount: { fontFamily: fonts.mono, fontSize: 28, fontWeight: '800' },
  teamTitle: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.ink,
    fontWeight: '700'
  },
  teamMotto: { color: colors.textMuted, fontSize: 12, lineHeight: 18 },
  teamRoster: { gap: 8, marginTop: 8, minHeight: 32 },
  teamPlayer: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  teamEmpty: { color: colors.textSubtle, fontSize: 12, fontStyle: 'italic' },
  briefing: { gap: 8 },
  briefingLabel: {
    fontFamily: fonts.mono,
    color: colors.accentStrong,
    letterSpacing: 1.5,
    fontSize: 10
  },
  briefingTitle: { color: colors.ink, fontSize: 20, fontWeight: '800' },
  assignmentCard: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 10,
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
    fontFamily: fonts.mono,
    fontSize: 38,
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
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
