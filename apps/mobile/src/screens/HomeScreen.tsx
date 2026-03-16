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
      eyebrow="Online Play"
      subtitle="Create or join an online match, then stay with your team on one shared live game flow."
      topSlot={<ProductNavBar current="home" />}
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Last operation failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Play Online"
        subtitle="Online cloud play is the main player path. Create or join a match, then move straight into the live map, questions, cards, and chat."
        tone="accent"
      >
        {state.runtimeKind !== 'online_foundation' ? (
          <StateBanner
            tone="info"
            title="Local mode is selected"
            detail="The main player flow uses online cloud sessions. The buttons below switch this device back to online mode for normal play."
          />
        ) : null}
        <AppButton
          label="Create Online Match"
          onPress={() => {
            selectRuntimeKind('online_foundation');
            router.push('/create-match');
          }}
        />
        <AppButton
          label="Join Online Match"
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
          Every normal player should use online mode on their own device. Local and referee sessions stay available for testing and demos only.
        </Text>
      </Panel>

      <Panel
        title="Player Profile"
        subtitle="This name is used when this device creates or joins a match."
      >
        <FactList
          items={[
            { label: 'Display Name', value: state.sessionProfile.displayName },
            {
              label: 'Online sign-in',
              value: state.sessionProfile.authUserId ? 'Ready' : 'Uses the saved player profile'
            }
          ]}
        />
        {onlineIdentityMismatch ? (
          <StateBanner
            tone="warning"
            title="Online match is still using the previous player"
            detail={`This match is connected as ${state.activeMatch?.recipient.playerId}. Disconnect and reconnect to switch the active online session to the profile shown here.`}
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
          subtitle="These modes stay available for development, referee play, and local testing. They are not the main consumer player path."
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
