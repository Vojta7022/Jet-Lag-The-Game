import { StyleSheet, Text, View } from 'react-native';

import type { RuntimeDiagnosticsModel } from './admin-debug-state.ts';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

interface RuntimeDiagnosticsPanelProps {
  model: RuntimeDiagnosticsModel;
}

const ROWS: Array<keyof RuntimeDiagnosticsModel> = [
  'runtimeKind',
  'runtimeMode',
  'transportFlavor',
  'connectionState',
  'matchId',
  'matchMode',
  'projectionScope',
  'snapshotVersion',
  'lastEventSequence',
  'syncKind',
  'baseSnapshotVersion',
  'eventStreamRange',
  'eventStreamCount',
  'joinCode',
  'joinExpiresAt'
];

export function RuntimeDiagnosticsPanel(props: RuntimeDiagnosticsPanelProps) {
  return (
    <Panel title="Runtime Diagnostics">
      {ROWS.map((rowKey) => {
        const value = props.model[rowKey];
        if (value === undefined) {
          return null;
        }

        return (
          <View key={rowKey} style={styles.row}>
            <Text style={styles.label}>{humanize(rowKey)}</Text>
            <Text style={styles.value}>{String(value)}</Text>
          </View>
        );
      })}
      <View style={styles.row}>
        <Text style={styles.label}>Requires Resync</Text>
        <Text style={styles.value}>{props.model.requiresResync ? 'Yes' : 'No'}</Text>
      </View>
      <View style={styles.eventTypes}>
        <Text style={styles.sectionTitle}>Recent Event Types</Text>
        {props.model.recentEventTypes.length === 0 ? (
          <Text style={styles.empty}>No event frames were delivered in the latest sync envelope.</Text>
        ) : (
          props.model.recentEventTypes.slice(0, 8).map((eventType, index) => (
            <Text key={`${eventType}:${index}`} style={styles.eventType}>
              {eventType}
            </Text>
          ))
        )}
      </View>
    </Panel>
  );
}

function humanize(value: string) {
  return value
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (first) => first.toUpperCase());
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
  eventTypes: {
    gap: 6,
    paddingTop: 6
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  eventType: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600'
  }
});
