import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { LocationShellState, LocationUpdateFrequencyMode } from './location-state.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

const frequencyModes: LocationUpdateFrequencyMode[] = ['manual', 'balanced', 'frequent'];

export function LocationControlsPanel(props: {
  state: LocationShellState;
  disabled?: boolean;
  canShare: boolean;
  onRefreshPermission: () => void;
  onRequestPermission: () => void;
  onRequestBackgroundPermission: () => void;
  onSelectFrequencyMode: (mode: LocationUpdateFrequencyMode) => void;
  onSendSingleUpdate: () => void;
  onStartSharing: () => void;
  onStopSharing: () => void;
  onClearError: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.modeRow}>
        {frequencyModes.map((mode) => (
          <Pressable
            key={mode}
            accessibilityRole="button"
            disabled={props.disabled}
            onPress={() => props.onSelectFrequencyMode(mode)}
            style={[
              styles.modeButton,
              props.state.frequencyMode === mode ? styles.modeButtonSelected : null,
              props.disabled ? styles.disabled : null
            ]}
          >
            <Text style={styles.modeLabel}>{mode}</Text>
          </Pressable>
        ))}
      </View>

      <AppButton
        label="Refresh Permission State"
        onPress={props.onRefreshPermission}
        tone="secondary"
        disabled={props.disabled}
      />
      <AppButton
        label="Request Foreground Permission"
        onPress={props.onRequestPermission}
        disabled={props.disabled}
      />
      <AppButton
        label={props.state.backgroundPermissionState === 'granted'
          ? 'Background GPS Enabled'
          : props.state.backgroundPermissionState === 'unavailable'
            ? 'Background GPS Unavailable'
            : 'Enable Background GPS'}
        onPress={props.onRequestBackgroundPermission}
        tone="secondary"
        disabled={
          props.disabled ||
          !props.canShare ||
          props.state.backgroundPermissionState === 'granted' ||
          props.state.backgroundPermissionState === 'unavailable'
        }
      />
      <AppButton
        label="Send One Location Update"
        onPress={props.onSendSingleUpdate}
        disabled={props.disabled || !props.canShare || props.state.permissionState !== 'granted'}
      />
      <AppButton
        label={props.state.sharingState === 'sharing' ? 'Sharing Active' : 'Start Continuous Sharing'}
        onPress={props.onStartSharing}
        disabled={
          props.disabled ||
          !props.canShare ||
          props.state.permissionState !== 'granted' ||
          props.state.frequencyMode === 'manual' ||
          props.state.sharingState === 'sharing'
        }
      />
      <AppButton
        label="Stop Sharing"
        onPress={props.onStopSharing}
        tone="secondary"
        disabled={props.disabled || props.state.sharingState !== 'sharing'}
      />
      {props.state.errorMessage ? (
        <AppButton label="Dismiss Location Error" onPress={props.onClearError} tone="secondary" disabled={props.disabled} />
      ) : null}
      <Text style={styles.copy}>
        Background GPS can keep team positions fresh while you switch apps or lock your phone. It needs a separate permission and an installed development/production build; system battery rules or force closing can still interrupt it. Check the GPS freshness before relying on a clue. Without background permission, foreground sharing works while the app is open.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  modeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  modeButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  modeButtonSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  modeLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  },
  disabled: {
    opacity: 0.55
  }
});
