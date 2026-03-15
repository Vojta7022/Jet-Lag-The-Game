import { router } from 'expo-router';
import { useState } from 'react';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function AuthScreen() {
  const { state, saveSessionProfile } = useAppShell();
  const [displayName, setDisplayName] = useState(state.sessionProfile.displayName);
  const [playerId, setPlayerId] = useState(state.sessionProfile.playerId);
  const [authUserId, setAuthUserId] = useState(state.sessionProfile.authUserId || state.sessionProfile.playerId);
  const onlineMatchConnected = state.activeMatch?.runtimeKind === 'online_foundation';

  return (
    <ScreenContainer
      title="Player Profile"
      subtitle="Set the player identity this device uses when it creates or joins a match. Online mode stays bound to the current profile until you reconnect."
    >
      <Panel title="Profile">
        {onlineMatchConnected ? (
          <StateBanner
            tone="warning"
            title="Reconnect to switch online players"
            detail={`The current online match is still connected as ${state.activeMatch?.recipient.playerId}. Save changes now, then disconnect and reconnect the match to use the updated profile.`}
          />
        ) : null}
        <Field
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Player name"
          autoCapitalize="words"
        />
        <Field
          label="Player Id"
          value={playerId}
          onChangeText={setPlayerId}
          placeholder="player-1"
        />
        <Field
          label="Auth User Id"
          value={authUserId}
          onChangeText={setAuthUserId}
          placeholder="auth-player-1"
        />
        <AppButton
          label="Save Session"
          onPress={() => {
            saveSessionProfile({
              displayName: displayName.trim() || 'Player',
              playerId: playerId.trim() || 'player-1',
              authUserId: authUserId.trim() || playerId.trim() || 'player-1'
            });
            router.replace('/');
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}
