import { StyleSheet, Text, View } from 'react-native';

import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { colors } from '../ui/theme.ts';

export function RuntimeModeSwitcher() {
  const { runtimeKind, runtimeOptions, selectRuntimeKind } = useRuntimeMode();
  const onlineOption = runtimeOptions.find((option) => option.kind === 'online_foundation');
  const secondaryOptions = runtimeOptions.filter((option) => option.kind !== 'online_foundation');

  return (
    <Panel
      title="Local And Test Modes"
      subtitle="These modes are still available for development, nearby sessions, and single-device referee play, but the main player path stays online-first."
    >
      <View style={styles.list}>
        {onlineOption ? (
          <View key={onlineOption.kind} style={[styles.option, styles.optionRecommended]}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel}>{onlineOption.label}</Text>
              <Text style={styles.optionState}>
                {runtimeKind === onlineOption.kind ? 'Current player mode' : 'Recommended'}
              </Text>
            </View>
            <Text style={styles.optionDescription}>{onlineOption.description}</Text>
            <AppButton
              label={runtimeKind === onlineOption.kind ? 'Using Online Mode' : 'Switch Back To Online'}
              onPress={() => selectRuntimeKind(onlineOption.kind)}
              disabled={runtimeKind === onlineOption.kind}
              tone={runtimeKind === onlineOption.kind ? 'secondary' : 'primary'}
            />
          </View>
        ) : null}

        {secondaryOptions.map((option) => (
          <View key={option.kind} style={styles.option}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionState}>
                {runtimeKind === option.kind ? 'Current local mode' : 'Secondary'}
              </Text>
            </View>
            <Text style={styles.optionDescription}>{option.description}</Text>
            <AppButton
              label={runtimeKind === option.kind ? 'Using This Mode' : 'Switch Mode'}
              onPress={() => selectRuntimeKind(option.kind)}
              disabled={runtimeKind === option.kind}
              tone={runtimeKind === option.kind ? 'secondary' : 'primary'}
            />
          </View>
        ))}
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12
  },
  option: {
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  optionRecommended: {
    backgroundColor: colors.surfaceMuted
  },
  optionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  optionLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  optionState: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  optionDescription: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
