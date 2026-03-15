import { StyleSheet, Text, View } from 'react-native';

import type { ProjectionInspectionModel } from './admin-debug-state.ts';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

interface ProjectionInspectorPanelProps {
  model: ProjectionInspectionModel;
}

export function ProjectionInspectorPanel(props: ProjectionInspectorPanelProps) {
  return (
    <Panel title="Projection Inspector">
      {props.model.summaryRows.map((row) => (
        <View key={row.label} style={styles.row}>
          <Text style={styles.label}>{row.label}</Text>
          <Text style={styles.value}>{row.value}</Text>
        </View>
      ))}
      <View style={styles.rawBlock}>
        <Text style={styles.rawTitle}>Current Scoped Projection JSON</Text>
        <Text selectable style={styles.rawJson}>
          {props.model.rawProjectionJson}
        </Text>
      </View>
    </Panel>
  );
}

const styles = StyleSheet.create({
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
    textAlign: 'right',
    flexShrink: 1
  },
  rawBlock: {
    gap: 8,
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    padding: 12
  },
  rawTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  rawJson: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  }
});
