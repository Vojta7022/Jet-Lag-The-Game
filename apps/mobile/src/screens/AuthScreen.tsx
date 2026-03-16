import { router } from 'expo-router';
import { useState } from 'react';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { normalizeDisplayName } from '../runtime/session-profile.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function AuthScreen() {
  const { state, saveSessionProfile } = useAppShell();
  const [displayName, setDisplayName] = useState(state.sessionProfile.displayName);
  const onlineMatchConnected = state.activeMatch?.runtimeKind === 'online_foundation';

  return (
    <ScreenContainer
      title="Player Profile"
      subtitle="Choose the display name other players see. This device keeps its own private player identity automatically."
    >
      <Panel title="Profile">
        {onlineMatchConnected ? (
          <StateBanner
            tone="warning"
            title="Reconnect to switch online players"
            detail={`The current online match is still connected as ${state.sessionProfile.displayName}. Save your new display name, then reconnect the match to use it.`}
          />
        ) : null}
        <Field
          label="Display Name"
          value={displayName}
          onChangeText={setDisplayName}
          placeholder="Player name"
          autoCapitalize="words"
        />
        <AppButton
          label="Save Session"
          onPress={() => {
            saveSessionProfile({
              ...state.sessionProfile,
              displayName: normalizeDisplayName(displayName, state.sessionProfile)
            });
            router.replace('/');
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}
