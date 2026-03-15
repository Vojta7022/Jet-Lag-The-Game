import { StyleSheet, Text, View } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { Panel } from '../ui/Panel.tsx';
import { colors } from '../ui/theme.ts';

export function MatchSummaryCard() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <Panel title="Current Match">
        <Text style={styles.empty}>No active transport connection is attached to the shell yet.</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Current Match">
      <View style={styles.row}>
        <Text style={styles.label}>Match</Text>
        <Text style={styles.value}>{activeMatch.matchId}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Foundation</Text>
        <Text style={styles.value}>{activeMatch.runtimeKind}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Mode</Text>
        <Text style={styles.value}>{activeMatch.matchMode}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Lifecycle</Text>
        <Text style={styles.value}>{activeMatch.lifecycleState}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Scope</Text>
        <Text style={styles.value}>{activeMatch.recipient.scope}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Connection</Text>
        <Text style={styles.value}>{activeMatch.connectionState}</Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  }
});
