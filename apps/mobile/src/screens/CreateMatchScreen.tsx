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
        return 'This connection mode creates matches in online cloud mode.';
      case 'nearby_host_authority':
        return 'This connection mode creates matches in nearby host-authoritative mode.';
      case 'single_device_referee':
        return 'This connection mode creates matches for single-device referee play.';
      case 'in_memory':
      default:
        return 'The in-memory mode is useful for local testing and quick match setup.';
    }
  }, [runtimeKind]);

  return (
    <ScreenContainer
      title="Create Match"
      subtitle="Start a new match in the current connection mode, then continue in the lobby."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Create match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Match Setup"
        subtitle="Choose an ID, scale, and match mode before creating the session."
      >
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
