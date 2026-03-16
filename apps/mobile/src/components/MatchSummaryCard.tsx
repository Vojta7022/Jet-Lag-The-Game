import { StyleSheet, Text } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { colors } from '../ui/theme.ts';

function formatValue(value: string | undefined): string {
  return (value ?? 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatSessionLabel(runtimeKind: string, matchMode: string): string {
  if (runtimeKind === 'online_foundation') {
    return 'Online shared match';
  }

  if (runtimeKind === 'nearby_host_authority') {
    return 'Nearby host session';
  }

  if (runtimeKind === 'single_device_referee') {
    return 'Single-device referee session';
  }

  return matchMode === 'online' ? 'Online-style local session' : 'Local test session';
}

function formatViewLabel(scope: string): string {
  switch (scope) {
    case 'player_private':
      return 'Personal view';
    case 'team_private':
      return 'Team view';
    case 'public_match':
      return 'Public match view';
    case 'host_admin':
      return 'Host view';
    default:
      return formatValue(scope);
  }
}

export function MatchSummaryCard() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <Panel title="Current Match" subtitle="Your active match and connection details appear here once you create or join a session.">
        <Text style={styles.empty}>No match is connected yet.</Text>
      </Panel>
    );
  }

  const connectedPlayer = activeMatch.projection.players.find(
    (player) => player.playerId === activeMatch.recipient.playerId
  );

  return (
    <Panel title="Current Match" subtitle="This stays in sync with the live session on this device.">
      <FactList
        items={[
          { label: 'Session', value: formatSessionLabel(activeMatch.runtimeKind, activeMatch.matchMode) },
          { label: 'Stage', value: formatValue(activeMatch.lifecycleState) },
          { label: 'Role', value: formatValue(activeMatch.playerRole ?? activeMatch.recipient.role ?? 'spectator') },
          { label: 'You', value: connectedPlayer?.displayName ?? state.sessionProfile.displayName },
          { label: 'View', value: formatViewLabel(activeMatch.recipient.scope) },
          { label: 'Connection', value: formatValue(activeMatch.connectionState) }
        ]}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  }
});
