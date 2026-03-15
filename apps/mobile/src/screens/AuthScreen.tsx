import { router } from 'expo-router';
import { useState } from 'react';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';

export function AuthScreen() {
  const { state, saveSessionProfile } = useAppShell();
  const [displayName, setDisplayName] = useState(state.sessionProfile.displayName);
  const [playerId, setPlayerId] = useState(state.sessionProfile.playerId);
  const [authUserId, setAuthUserId] = useState(state.sessionProfile.authUserId || state.sessionProfile.playerId);

  return (
    <ScreenContainer
      title="Session Entry"
      subtitle="Basic session shell for runtime wiring. Online mode uses this as the mocked auth/session identity."
    >
      <Panel title="Profile">
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
