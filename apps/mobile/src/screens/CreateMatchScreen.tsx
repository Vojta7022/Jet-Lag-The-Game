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
  const matchMode = runtimeKind === 'online_foundation'
    ? 'online'
    : runtimeKind === 'nearby_host_authority'
      ? 'local_nearby'
      : 'single_device_referee';

  const runtimeHint = useMemo(() => {
    switch (runtimeKind) {
      case 'online_foundation':
        return 'This creates a shared online match. The saved player profile becomes the host for the current cloud session on this device.';
      case 'nearby_host_authority':
        return 'This creates a nearby host session on this device for local testing or in-person play.';
      case 'single_device_referee':
        return 'This creates a single-device referee session on this device.';
      case 'in_memory':
      default:
        return 'This local in-memory mode is mainly for quick testing without network or nearby transport.';
    }
  }, [runtimeKind]);

  return (
    <ScreenContainer
      title={runtimeKind === 'online_foundation' ? 'Create Online Match' : 'Create Match'}
      subtitle="Start a match with the saved player profile, then continue into the match room and live map."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Create match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Match Setup"
        subtitle="Choose a match code and game size, then create the session."
      >
        <Field label="Match Code" value={matchId} onChangeText={setMatchId} placeholder="prague-night-run" />
        <Field
          label="Game Size"
          value={initialScale}
          onChangeText={(value) => setInitialScale(value as typeof initialScale)}
          placeholder="small"
        />
        {runtimeKind === 'online_foundation' ? (
          <StateBanner
            tone="info"
            title="Online shared match"
            detail="Each player can join from their own device. This is the main player-facing way to play."
          />
        ) : (
          <StateBanner
            tone="warning"
            title="Local or referee mode"
            detail="This mode is available, but the main player flow is designed around online cloud play."
          />
        )}
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
