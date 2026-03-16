import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { mobileAppEnvironment } from '../config/env.ts';
import { AppButton } from '../ui/AppButton.tsx';
import { Field } from '../ui/Field.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

const SCALE_OPTIONS = [
  { value: 'small', label: 'Small' },
  { value: 'medium', label: 'Medium' },
  { value: 'large', label: 'Large' }
] as const;

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
      eyebrow="Pregame"
      subtitle="Start a match with the saved player profile, then continue into the match room and live map."
    >
      {state.errorMessage ? (
        <StateBanner tone="error" title="Create match failed" detail={state.errorMessage} />
      ) : null}

      <Panel
        title="Match Setup"
        subtitle="Choose a match code and game size, then create the session."
        tone="accent"
      >
        <Field label="Match Code" value={matchId} onChangeText={setMatchId} placeholder="prague-night-run" />
        <View style={styles.choiceGroup}>
          <Text style={styles.choiceLabel}>Game Size</Text>
          <View style={styles.choiceRow}>
            {SCALE_OPTIONS.map((option) => {
              const selected = option.value === initialScale;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  onPress={() => setInitialScale(option.value)}
                  style={[styles.choiceChip, selected ? styles.choiceChipSelected : null]}
                >
                  <Text style={[styles.choiceChipLabel, selected ? styles.choiceChipLabelSelected : null]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
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
          label={state.loadState === 'loading' ? 'Creating Match...' : 'Create Match Room'}
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

const styles = StyleSheet.create({
  choiceGroup: {
    gap: 10
  },
  choiceLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  choiceRow: {
    flexDirection: 'row',
    gap: 8
  },
  choiceChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 12,
    paddingVertical: 12
  },
  choiceChipSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  choiceChipLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  choiceChipLabelSelected: {
    color: colors.inkInverse
  }
});
