import { router } from 'expo-router';
import { StyleSheet, Text } from 'react-native';

import { MatchSummaryCard } from '../components/MatchSummaryCard.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { RuntimeModeSwitcher } from '../components/RuntimeModeSwitcher.tsx';
import { mobileAppEnvironment } from '../config/env.ts';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import type { AppShellState } from '../state/app-shell-state.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function hasOnlineIdentityMismatch(
  profile: {
    playerId: string;
    authUserId?: string;
  },
  activeMatch: AppShellState['activeMatch']
) {
  if (!activeMatch || activeMatch.runtimeKind !== 'online_foundation') {
    return false;
  }

  return activeMatch.recipient.playerId !== profile.playerId ||
    activeMatch.recipient.actorId !== (profile.authUserId ?? profile.playerId);
}

export function HomeScreen() {
  const { state, disconnectActiveMatch, selectRuntimeKind } = useAppShell();
  const onlineIdentityMismatch = hasOnlineIdentityMismatch(state.sessionProfile, state.activeMatch);
  const activeMatch = state.activeMatch;
  const activeStage = activeMatch?.projection.lifecycleState;
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );
  const continueRoute = activeMatch
    ? activeStage === 'draft' || activeStage === 'lobby' || activeStage === 'role_assignment'
      ? '/lobby'
      : '/map'
    : undefined;
  const continueLabel = activeMatch
    ? activeMatch.projection.visibleMap
      ? 'Continue Match'
      : 'Continue Setup'
    : undefined;

  return (
    <ScreenContainer
      title="Transit Hide and Seek"
      eyebrow="Game Night"
      subtitle="Run a complete hide-and-seek game with one device as the referee, or connect players online."
      topSlot={<ProductNavBar current="home" />}
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Last operation failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Start a Game"
        subtitle="The referee keeps this device and manages the shared map, questions, cards, and game flow."
        tone="accent"
      >
        <AppButton
          label="Start Referee Game"
          disabled={state.loadState === 'loading'}
          onPress={() => {
            selectRuntimeKind('single_device_referee');
            router.push('/create-match');
          }}
        />
        <AppButton
          label="Create Online Match"
          disabled={state.loadState === 'loading'}
          onPress={() => {
            selectRuntimeKind('online_foundation');
            router.push('/create-match');
          }}
          tone="secondary"
        />
        <AppButton
          label="Join Online Match"
          disabled={state.loadState === 'loading'}
          onPress={() => {
            selectRuntimeKind('online_foundation');
            router.push('/join-match');
          }}
          tone="secondary"
        />
        {continueRoute && continueLabel ? (
          <AppButton
            label={continueLabel}
            onPress={() => {
              router.push(continueRoute as Parameters<typeof router.push>[0]);
            }}
            tone="secondary"
          />
        ) : null}
        <Text style={styles.helper}>
          Referee mode is designed for everyone to gather around one device. To play remotely, each person joins the online match from their own device.
        </Text>
      </Panel>

      <Panel
        title="Player Profile"
        subtitle="This is the name other players see when this device creates or joins a match."
      >
        <FactList
          items={[
            { label: 'Display Name', value: state.sessionProfile.displayName },
            {
              label: 'Online sign-in',
              value: 'Automatic on this device'
            }
          ]}
        />
        {onlineIdentityMismatch ? (
          <StateBanner
            tone="warning"
            title="Reconnect to switch players"
            detail={`This match is still using the previous online player for ${state.activeMatch?.projection.players.find((player) => player.playerId === state.activeMatch?.recipient.playerId)?.displayName ?? 'this device'}. Disconnect and reconnect to use the profile shown here.`}
          />
        ) : null}
        <AppButton label="Edit Profile" onPress={() => router.push('/auth')} tone="secondary" />
      </Panel>

      <MatchSummaryCard />

      {activeMatch ? (
        <Panel
          title="Current Session"
          subtitle="Reconnect, continue the match, or leave cleanly without digging through setup tools."
        >
          {canOpenMatchControls ? (
            <AppButton
              label="Open Match Controls"
              onPress={() => {
                router.push('/status');
              }}
              tone="secondary"
            />
          ) : null}
          <AppButton
            label="Disconnect Match"
            onPress={() => {
              void disconnectActiveMatch();
            }}
            tone="danger"
            disabled={!state.activeMatch}
          />
        </Panel>
      ) : null}

      {mobileAppEnvironment.enableDeveloperTools ? (
        <Panel
          title="Other Ways To Play"
          subtitle="Local runtime options for development and testing."
          tone="soft"
        >
          <RuntimeModeSwitcher />
        </Panel>
      ) : null}
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
