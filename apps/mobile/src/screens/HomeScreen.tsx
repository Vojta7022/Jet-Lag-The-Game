import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { MatchSummaryCard } from '../components/MatchSummaryCard.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { RuntimeModeSwitcher } from '../components/RuntimeModeSwitcher.tsx';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

export function HomeScreen() {
  const { state, disconnectActiveMatch } = useAppShell();

  return (
    <ScreenContainer
      title="Transit Hide and Seek"
      subtitle="Create or join a match, then move between lobby, map, questions, cards, chat, movement, and referee tools from one shared mobile workspace."
      topSlot={<ProductNavBar current="home" />}
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Last operation failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Player Profile"
        subtitle="This identity is used when you create or join a match."
      >
        <FactList
          items={[
            { label: 'Display Name', value: state.sessionProfile.displayName },
            { label: 'Player ID', value: state.sessionProfile.playerId },
            { label: 'Auth ID', value: state.sessionProfile.authUserId || 'Matches player ID' }
          ]}
        />
        <AppButton label="Edit Profile" onPress={() => router.push('/auth')} tone="secondary" />
      </Panel>

      <RuntimeModeSwitcher />
      <MatchSummaryCard />

      <Panel
        title="Get Started"
        subtitle="Start a new match or join an existing one, then use the workspace tabs above to continue."
      >
        <AppButton label="Create Match" onPress={() => router.push('/create-match')} />
        <AppButton label="Join Match" onPress={() => router.push('/join-match')} tone="secondary" />
        <Text style={styles.helper}>
          Already connected? Use the workspace bar to move between setup, play, communication, and referee tools.
        </Text>
        <AppButton
          label="Disconnect Match"
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
  helper: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
