import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
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
      subtitle="Review the current match, confirm who is visible in your scope, and move into setup or play."
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
          subtitle="This summary comes from the active scoped projection."
        >
          <FactList
            items={[
              { label: 'Match', value: state.activeMatch.matchId },
              { label: 'Stage', value: state.activeMatch.lifecycleState },
              { label: 'View', value: state.activeMatch.recipient.scope },
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

      {projection ? (
        <Panel
          title="Players"
          subtitle="Player visibility follows the current connection scope."
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
          title="Next Steps"
          subtitle="Move into the areas most useful from the current match stage."
        >
          <AppButton label="Role Overview" onPress={() => router.push('/dashboard')} />
          <AppButton label="Map Setup" onPress={() => router.push('/map')} tone="secondary" />
          <AppButton label="Questions" onPress={() => router.push('/questions')} tone="secondary" />
          <AppButton label="Chat" onPress={() => router.push('/chat')} tone="secondary" />
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
