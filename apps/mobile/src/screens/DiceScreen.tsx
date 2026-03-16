import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { GameplayTabBar } from '../components/GameplayTabBar.tsx';
import { ProductNavBar } from '../components/ProductNavBar.tsx';
import { canAccessHostControls } from '../navigation/player-flow.ts';
import { useAppShell } from '../providers/AppShellProvider.tsx';
import { AppButton } from '../ui/AppButton.tsx';
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
      subtitle={liveGameplayState ? 'Quick player-side rolls.' : 'Quick player-side rolls and checks.'}
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
        <View style={styles.utilityBar}>
          <View style={styles.actionCell}>
            <AppButton label="Back To Live Map" onPress={() => router.push('/map')} tone="secondary" />
          </View>
          {canOpenMatchControls ? (
            <View style={styles.actionCell}>
              <AppButton label="Match Controls" onPress={() => router.push('/status')} tone="ghost" />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={styles.hero}>
        <View style={styles.heroHeader}>
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>Dice utility</Text>
            <Text style={styles.heroTitle}>{latestRoll ? latestRoll.label : 'Ready to roll'}</Text>
            <Text style={styles.heroCopy}>
              Local helper only. Use it for quick card and curse checks, then jump back into play.
            </Text>
          </View>
          <View style={styles.heroMeta}>
            <Text style={styles.heroMetaValue}>
              {activeMatch?.projection.seekPhaseSubstate ?? activeMatch?.projection.lifecycleState ?? 'Unavailable'}
            </Text>
            <Text style={styles.heroMetaLabel}>Stage</Text>
          </View>
        </View>

        <View style={styles.chipRow}>
          <View style={styles.infoChip}>
            <Text style={styles.infoValue}>{activeMatch?.playerRole ?? activeMatch?.recipient.role ?? 'spectator'}</Text>
            <Text style={styles.infoLabel}>Role</Text>
          </View>
          <View style={styles.infoChip}>
            <Text style={styles.infoValue}>{latestRoll ? latestRoll.label : 'No roll yet'}</Text>
            <Text style={styles.infoLabel}>Mode</Text>
          </View>
        </View>

        <View style={styles.resultCard}>
          <Text style={styles.resultLabel}>{latestRoll ? latestRoll.label : 'Tap to roll'}</Text>
          <Text style={styles.resultTotal}>{latestRoll ? latestRoll.total : '--'}</Text>
          <Text style={styles.resultBreakdown}>
            {latestRoll ? latestRoll.values.join(' + ') : '1d6 or 2d6'}
          </Text>
        </View>

        <View style={styles.rollRow}>
          <View style={styles.actionCell}>
            <AppButton label="Roll 1d6" onPress={() => pushRoll('1d6')} />
          </View>
          <View style={styles.actionCell}>
            <AppButton label="Roll 2d6" onPress={() => pushRoll('2d6')} tone="secondary" />
          </View>
        </View>
      </View>

      <View style={styles.historyShell}>
        <Text style={styles.historyTitle}>Recent rolls</Text>
        {history.length === 0 ? (
          <Text style={styles.copy}>No rolls yet.</Text>
        ) : (
          <View style={styles.historyList}>
            {history.map((entry) => (
              <View key={entry.rollKey} style={styles.historyCard}>
                <View style={styles.historyText}>
                  <Text style={styles.historyLabel}>{entry.label}</Text>
                  <Text style={styles.historyDetail}>{entry.values.join(' + ')}</Text>
                </View>
                <Text style={styles.historyTotal}>{entry.total}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  utilityBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  actionCell: {
    flexBasis: '48%',
    flexGrow: 1
  },
  hero: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 30,
    borderWidth: 1,
    gap: 16,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.05,
    shadowRadius: 22,
    elevation: 2
  },
  heroHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  heroText: {
    flex: 1,
    gap: 4
  },
  heroEyebrow: {
    color: colors.accentStrong,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase'
  },
  heroTitle: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '800'
  },
  heroCopy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  },
  heroMeta: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 2,
    minWidth: 88,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  heroMetaValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  heroMetaLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  infoChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    gap: 4,
    minWidth: 96,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  infoValue: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800'
  },
  infoLabel: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  rollRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  resultCard: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
    paddingVertical: 34,
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
    fontSize: 64,
    fontWeight: '800'
  },
  resultBreakdown: {
    color: colors.textMuted,
    fontSize: 14
  },
  historyShell: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 12,
    padding: 16
  },
  historyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
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
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  historyText: {
    flex: 1,
    gap: 2
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
