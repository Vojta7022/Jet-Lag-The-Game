import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function LobbyScreen() {
  const { state, refreshActiveMatch } = useAppShell();
  const projection = state.activeMatch?.projection;

  return (
    <ScreenContainer
      title="Lobby"
      subtitle="Real projection data from the selected transport foundation. This remains intentionally minimal until richer UI phases."
    >
      {!state.activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Create or join a match first, then come back here to inspect the current projection."
        />
      ) : null}

      {state.activeMatch ? (
        <Panel title="Match Snapshot">
          <Text style={styles.copy}>Match Id: {state.activeMatch.matchId}</Text>
          <Text style={styles.copy}>Lifecycle: {state.activeMatch.lifecycleState}</Text>
          <Text style={styles.copy}>Scope: {state.activeMatch.recipient.scope}</Text>
          <Text style={styles.copy}>Players visible: {projection?.players.length ?? 0}</Text>
          <Text style={styles.copy}>Teams visible: {projection?.teams.length ?? 0}</Text>
          <AppButton
            label="Refresh Snapshot"
            onPress={() => {
              void refreshActiveMatch();
            }}
          />
        </Panel>
      ) : null}

      {projection ? (
        <Panel title="Visible Players">
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
        <Panel title="Next Steps">
          <AppButton label="Open Chat" onPress={() => router.push('/chat')} />
          <AppButton label="Open Map Setup" onPress={() => router.push('/map')} tone="secondary" />
          <AppButton label="Open Movement" onPress={() => router.push('/movement')} tone="secondary" />
          <AppButton label="Open Role Dashboard" onPress={() => router.push('/dashboard')} />
          <AppButton label="Open Session Status" onPress={() => router.push('/status')} tone="secondary" />
        </Panel>
      ) : null}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
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
