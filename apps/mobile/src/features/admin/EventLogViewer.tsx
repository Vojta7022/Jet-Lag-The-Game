import { StyleSheet, Text, View } from 'react-native';

import type { EventLogEntry } from '../../../../../packages/shared-types/src/index.ts';
import { Panel } from '../../ui/Panel.tsx';
import { colors } from '../../ui/theme.ts';

interface EventLogViewerProps {
  entries: EventLogEntry[];
}

export function EventLogViewer(props: EventLogViewerProps) {
  return (
    <Panel title="Event Log">
      {props.entries.length === 0 ? (
        <Text style={styles.empty}>No visible event-log entries are available for this projection scope yet.</Text>
      ) : (
        props.entries.slice(0, 20).map((entry) => (
          <View key={entry.eventId} style={styles.entry}>
            <View style={styles.row}>
              <Text style={styles.sequence}>#{entry.sequence}</Text>
              <Text style={styles.type}>{entry.type}</Text>
            </View>
            <Text style={styles.meta}>
              {entry.actorRole} via {entry.visibilityScope}
            </Text>
            <Text style={styles.meta}>
              {entry.actorId} at {entry.occurredAt}
            </Text>
          </View>
        ))
      )}
    </Panel>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  entry: {
    gap: 4,
    paddingBottom: 10,
    borderBottomColor: colors.border,
    borderBottomWidth: 1
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center'
  },
  sequence: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700'
  },
  type: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
