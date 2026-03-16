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
  const role = state.activeMatch?.playerRole ?? state.activeMatch?.recipient.role ?? 'spectator';
  const roleLabel = role.replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
  const primaryNextRoute = projection?.visibleMap ? '/map' : '/dashboard';
  const primaryNextLabel = projection?.visibleMap ? 'Enter Game' : 'Open Team View';

  return (
    <ScreenContainer
      title="Match Room"
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
          title="Continue Playing"
          subtitle="Jump to the screen that matters most from the current stage."
        >
          <AppButton label={primaryNextLabel} onPress={() => router.push(primaryNextRoute)} />
          <AppButton label="Questions" onPress={() => router.push('/questions')} tone="secondary" />
          {role === 'hider' || role === 'host' ? (
            <AppButton label="Deck" onPress={() => router.push('/cards')} tone="secondary" />
          ) : null}
          <AppButton label="Dice" onPress={() => router.push('/dice')} tone="secondary" />
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
