import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { MatchSummaryCard } from '../components/MatchSummaryCard.tsx';
import { RuntimeModeSwitcher } from '../components/RuntimeModeSwitcher.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function HomeScreen() {
  const { state, disconnectActiveMatch } = useAppShell();

  return (
    <ScreenContainer
      title="Transit Hide and Seek"
      subtitle="Thin Expo shell wired to the real engine and transport foundations already built in the workspace."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Last operation failed" detail={state.errorMessage} />
      ) : null}

      <Panel title="Session Entry">
        <View style={styles.sessionRow}>
          <Text style={styles.label}>Display Name</Text>
          <Text style={styles.value}>{state.sessionProfile.displayName}</Text>
        </View>
        <View style={styles.sessionRow}>
          <Text style={styles.label}>Player Id</Text>
          <Text style={styles.value}>{state.sessionProfile.playerId}</Text>
        </View>
        <View style={styles.sessionRow}>
          <Text style={styles.label}>Auth User Id</Text>
          <Text style={styles.value}>{state.sessionProfile.authUserId || 'Matches player id'}</Text>
        </View>
        <AppButton label="Edit Session" onPress={() => router.push('/auth')} tone="secondary" />
      </Panel>

      <RuntimeModeSwitcher />
      <MatchSummaryCard />

      <Panel title="Match Actions">
        <AppButton label="Create Match" onPress={() => router.push('/create-match')} />
        <AppButton label="Join Match" onPress={() => router.push('/join-match')} tone="secondary" />
        <AppButton label="Open Lobby" onPress={() => router.push('/lobby')} tone="secondary" />
        <AppButton label="Open Map Setup" onPress={() => router.push('/map')} tone="secondary" />
        <AppButton label="Open Movement" onPress={() => router.push('/movement')} tone="secondary" />
        <AppButton label="Open Question Center" onPress={() => router.push('/questions')} tone="secondary" />
        <AppButton label="Open Cards" onPress={() => router.push('/cards')} tone="secondary" />
        <AppButton label="Open Chat" onPress={() => router.push('/chat')} tone="secondary" />
        <AppButton label="Open Admin / Debug" onPress={() => router.push('/admin')} tone="secondary" />
        <AppButton label="Open Dashboard" onPress={() => router.push('/dashboard')} tone="secondary" />
        <AppButton label="Open Status" onPress={() => router.push('/status')} tone="secondary" />
        <AppButton
          label="Disconnect Active Match"
          onPress={() => {
            void disconnectActiveMatch();
          }}
          tone="danger"
          disabled={!state.activeMatch}
        />
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  sessionRow: {
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
