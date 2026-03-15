import { StyleSheet, Text, View } from 'react-native';

import type { MatchTimingDisplayModel } from './timer-model.ts';

import { colors } from '../../ui/theme.ts';

interface MatchTimingPanelProps {
  model: MatchTimingDisplayModel | undefined;
}

function renderSummaryRow(label: string, value: string | undefined) {
  if (!value) {
    return null;
  }

  return (
    <View key={label} style={styles.summaryRow}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

export function MatchTimingPanel(props: MatchTimingPanelProps) {
  if (!props.model) {
    return (
      <Text style={styles.empty}>
        Timing details appear here once a match projection is connected.
      </Text>
    );
  }

  return (
    <View style={styles.container}>
        <View style={styles.summarySection}>
          {renderSummaryRow('Phase', props.model.phaseLabel)}
        {renderSummaryRow('Updated', props.model.freshnessLabel)}
      </View>

      {props.model.pauseSummary ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Pause State</Text>
          <Text style={styles.noteBody}>{props.model.pauseSummary}</Text>
          {props.model.pauseDetail ? <Text style={styles.noteBody}>{props.model.pauseDetail}</Text> : null}
        </View>
      ) : null}

      {props.model.flowLockSummary ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Flow Lock</Text>
          <Text style={styles.noteBody}>{props.model.flowLockSummary}</Text>
          {props.model.flowLockDetail ? <Text style={styles.noteBody}>{props.model.flowLockDetail}</Text> : null}
        </View>
      ) : null}

      {props.model.timers.length === 0 ? (
        <Text style={styles.empty}>
          No active countdown is visible in the current projection.
        </Text>
      ) : (
        <View style={styles.timerList}>
          {props.model.timers.map((timer) => (
            <View key={timer.timerId} style={styles.timerCard}>
              <View style={styles.timerHeader}>
                <Text style={styles.timerLabel}>{timer.label}</Text>
                <Text style={styles.timerValue}>{timer.remainingLabel}</Text>
              </View>
              <View style={styles.timerHeader}>
                <Text style={styles.timerStatus}>{timer.statusLabel}</Text>
                <Text style={styles.timerDetail}>{timer.detail}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  summarySection: {
    gap: 8
  },
  summaryRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  summaryLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase'
  },
  summaryValue: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  },
  noteCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 4,
    padding: 12
  },
  noteTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  noteBody: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  timerList: {
    gap: 8
  },
  timerCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 4,
    padding: 12
  },
  timerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  timerLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  timerValue: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800'
  },
  timerStatus: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  timerDetail: {
    color: colors.textMuted,
    flex: 1,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right'
  },
  empty: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
