import { StyleSheet, Text, View } from 'react-native';

import { useRuntimeMode } from '../providers/RuntimeModeProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { Panel } from '../ui/Panel.tsx';
import { colors } from '../ui/theme.ts';

export function RuntimeModeSwitcher() {
  const { runtimeKind, runtimeOptions, selectRuntimeKind } = useRuntimeMode();

  return (
    <Panel title="Runtime Switcher">
      <Text style={styles.copy}>
        Developer switcher for the transport foundations already built in the workspace.
      </Text>
      <View style={styles.list}>
        {runtimeOptions.map((option) => (
          <View key={option.kind} style={styles.option}>
            <View style={styles.optionHeader}>
              <Text style={styles.optionLabel}>{option.label}</Text>
              <Text style={styles.optionState}>
                {runtimeKind === option.kind ? 'Selected' : 'Available'}
              </Text>
            </View>
            <Text style={styles.optionDescription}>{option.description}</Text>
            <AppButton
              label={runtimeKind === option.kind ? 'Current Mode' : 'Use This Mode'}
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
  copy: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
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
