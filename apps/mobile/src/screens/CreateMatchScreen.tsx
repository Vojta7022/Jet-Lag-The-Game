import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Text } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { mobileAppEnvironment } from '../config/env.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';

export function CreateMatchScreen() {
  const { state, createMatch } = useAppShell();
  const { runtimeKind } = useRuntimeMode();
  const [matchId, setMatchId] = useState(`${mobileAppEnvironment.defaultMatchPrefix}-${Date.now().toString(36)}`);
  const [initialScale, setInitialScale] = useState<'small' | 'medium' | 'large'>('small');
  const [matchMode, setMatchMode] = useState<'online' | 'local_nearby' | 'single_device_referee'>('single_device_referee');

  const runtimeHint = useMemo(() => {
    switch (runtimeKind) {
      case 'online_foundation':
        return 'Runtime is locked to online cloud mode for this adapter.';
      case 'nearby_host_authority':
        return 'Runtime is locked to local nearby host-authoritative mode.';
      case 'single_device_referee':
        return 'Runtime is locked to the single-device referee foundation.';
      case 'in_memory':
      default:
        return 'In-memory foundation can emulate the different match modes for quick debugging.';
    }
  }, [runtimeKind]);

  return (
    <ScreenContainer
      title="Create Match"
      subtitle="Creates a match through the selected runtime foundation and then attaches the shell to the resulting host/admin projection."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Create match failed" detail={state.errorMessage} />
      ) : null}

      <Panel title="Match Setup">
        <Field label="Match Id" value={matchId} onChangeText={setMatchId} placeholder="match-prague-1" />
        <Field label="Initial Scale" value={initialScale} onChangeText={(value) => setInitialScale(value as typeof initialScale)} placeholder="small" />
        <Field
          label="Match Mode"
          value={matchMode}
          onChangeText={(value) => setMatchMode(value as typeof matchMode)}
          placeholder="single_device_referee"
        />
        <Text>{runtimeHint}</Text>
        <AppButton
          label={state.loadState === 'loading' ? 'Creating...' : 'Create Match'}
          disabled={state.loadState === 'loading'}
          onPress={() => {
            void createMatch({
              matchId: matchId.trim(),
              initialScale,
              matchMode
            }).then((accepted) => {
              if (accepted) {
                router.replace('/lobby');
              }
            });
          }}
        />
      </Panel>
    </ScreenContainer>
  );
}
