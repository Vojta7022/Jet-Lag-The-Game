import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
import { FactList } from '../ui/FactList.tsx';
import { Panel } from '../ui/Panel.tsx';
import { ScreenContainer } from '../ui/ScreenContainer.tsx';
import { StateBanner } from '../ui/StateBanner.tsx';
import { colors } from '../ui/theme.ts';

function isLiveGameplayState(lifecycleState: string | undefined) {
  return lifecycleState === 'hide_phase' ||
    lifecycleState === 'seek_phase' ||
    lifecycleState === 'endgame' ||
    lifecycleState === 'game_complete';
}

interface DiceHistoryEntry {
  rollKey: string;
  label: string;
  values: number[];
  total: number;
}

function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1;
}

function createDiceEntry(label: '1d6' | '2d6'): DiceHistoryEntry {
  const values = label === '2d6' ? [rollDie(), rollDie()] : [rollDie()];
  return {
    rollKey: `${label}:${Date.now()}:${values.join('-')}`,
    label,
    values,
    total: values.reduce((sum, value) => sum + value, 0)
  };
}

export function DiceScreen() {
  const { state } = useAppShell();
  const activeMatch = state.activeMatch;
  const liveGameplayState = isLiveGameplayState(activeMatch?.projection.lifecycleState);
  const [history, setHistory] = useState<DiceHistoryEntry[]>([]);
  const latestRoll = history[0];
  const canOpenMatchControls = canAccessHostControls(
    activeMatch?.playerRole ?? activeMatch?.recipient.role,
    activeMatch?.recipient.scope
  );

  const pushRoll = (label: '1d6' | '2d6') => {
    const nextEntry = createDiceEntry(label);
    setHistory((current) => [nextEntry, ...current].slice(0, 5));
  };

  return (
    <ScreenContainer
      title="Dice"
      eyebrow={liveGameplayState ? 'Live Game' : 'Support'}
      subtitle="Roll for card costs, curse checks, and other live-play moments that still need a simple player-side die."
      topSlot={liveGameplayState ? undefined : <ProductNavBar current="dice" />}
      bottomSlot={liveGameplayState ? <GameplayTabBar current="dice" /> : undefined}
    >
      {!activeMatch ? (
        <StateBanner
          tone="warning"
          title="No active match"
          detail="Join or create a match first, then use dice from the live gameplay shell."
        />
      ) : null}

      {liveGameplayState ? (
        <Panel title="Quick Utility" subtitle="Use dice as a supporting live tool, then jump back to the map." tone="soft">
          <AppButton label="Back To Live Map" onPress={() => router.push('/map')} tone="secondary" />
          {canOpenMatchControls ? (
            <AppButton label="Open Match Controls" onPress={() => router.push('/status')} tone="ghost" />
          ) : null}
        </Panel>
      ) : null}

      <Panel
        title="Dice Table"
        subtitle="This is a simple player-facing dice helper. The engine still treats these rolls as local utility, not stored match state."
        tone="accent"
      >
        <FactList
          items={[
            { label: 'Role', value: activeMatch?.playerRole ?? activeMatch?.recipient.role ?? 'spectator' },
            { label: 'Stage', value: activeMatch?.projection.seekPhaseSubstate ?? activeMatch?.projection.lifecycleState ?? 'Unavailable' },
            { label: 'Latest Roll', value: latestRoll ? `${latestRoll.label} = ${latestRoll.total}` : 'No roll yet' }
          ]}
        />
        <View style={styles.rollRow}>
          <AppButton label="Roll 1d6" onPress={() => pushRoll('1d6')} />
          <AppButton label="Roll 2d6" onPress={() => pushRoll('2d6')} tone="secondary" />
        </View>
      </Panel>

      <Panel
        title="Current Result"
        subtitle="Read the latest total at a glance, then keep the last few rolls visible for checks and card costs."
        tone="soft"
      >
        {latestRoll ? (
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>{latestRoll.label}</Text>
            <Text style={styles.resultTotal}>{latestRoll.total}</Text>
            <Text style={styles.resultBreakdown}>
              {latestRoll.values.join(' + ')}
            </Text>
          </View>
        ) : (
          <Text style={styles.copy}>
            Roll once to start. Recent results stay on this device so players can resolve manual curse and card checks without leaving the game shell.
          </Text>
        )}
      </Panel>

      <Panel
        title="Recent Rolls"
        subtitle="Keep a short memory of the last few dice checks."
      >
        {history.length === 0 ? (
          <Text style={styles.copy}>No dice rolls yet.</Text>
        ) : (
          <View style={styles.historyList}>
            {history.map((entry) => (
              <View key={entry.rollKey} style={styles.historyCard}>
                <Text style={styles.historyLabel}>{entry.label}</Text>
                <Text style={styles.historyTotal}>{entry.total}</Text>
                <Text style={styles.historyDetail}>{entry.values.join(' + ')}</Text>
              </View>
            ))}
          </View>
        )}
      </Panel>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  rollRow: {
    gap: 10
  },
  resultCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceRaised,
    paddingVertical: 28,
    paddingHorizontal: 16
  },
  resultLabel: {
    color: colors.textSubtle,
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase'
  },
  resultTotal: {
    color: colors.accentStrong,
    fontSize: 52,
    fontWeight: '800'
  },
  resultBreakdown: {
    color: colors.textMuted,
    fontSize: 14
  },
  historyList: {
    gap: 10
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  historyLabel: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  historyTotal: {
    color: colors.accent,
    fontSize: 22,
    fontWeight: '800'
  },
  historyDetail: {
    color: colors.textMuted,
    fontSize: 12
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
