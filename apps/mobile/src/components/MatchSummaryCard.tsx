import { StyleSheet, Text } from 'react-native';

import { useAppShell } from '../providers/AppShellProvider.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { colors } from '../ui/theme.ts';

function formatValue(value: string | undefined): string {
  return (value ?? 'unknown')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function MatchSummaryCard() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;

  if (!activeMatch) {
    return (
      <Panel title="Current Match" subtitle="Your active match and connection details appear here once you create or join a session.">
        <Text style={styles.empty}>No match is connected yet.</Text>
      </Panel>
    );
  }

  return (
    <Panel title="Current Match" subtitle="This summary stays in sync with the active runtime connection.">
      <FactList
        items={[
          { label: 'Match', value: activeMatch.matchId },
          { label: 'Connection Mode', value: formatValue(activeMatch.runtimeKind) },
          { label: 'Match Mode', value: formatValue(activeMatch.matchMode) },
          { label: 'Stage', value: formatValue(activeMatch.lifecycleState) },
          { label: 'Connected Player', value: activeMatch.recipient.playerId ?? 'Public scope only' },
          { label: 'View', value: formatValue(activeMatch.recipient.scope) },
          ...(activeMatch.runtimeKind === 'online_foundation'
            ? [{ label: 'Auth Session User', value: activeMatch.recipient.actorId }]
            : []),
          { label: 'Connection', value: formatValue(activeMatch.connectionState) }
        ]}
      />
    </Panel>
  );
}

const styles = StyleSheet.create({
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20
  }
});
