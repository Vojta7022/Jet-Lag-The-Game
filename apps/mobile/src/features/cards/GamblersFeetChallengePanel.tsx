import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

type PlayerRow = { playerId: string; displayName: string };

interface GamblersFeetChallengePanelProps {
  challenge?: MatchProjection['gamblersFeetChallenge'];
  players: PlayerRow[];
  viewerRole?: MatchRole;
  viewerPlayerId?: string;
  disabled?: boolean;
  onRoll: (playerId: string, dieRoll: number) => void;
  onReportSteps: (playerId: string, stepsTaken: number, overstep?: 'accidental' | 'safety') => void;
}

export function GamblersFeetChallengePanel(props: GamblersFeetChallengePanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState(props.viewerPlayerId ?? props.players[0]?.playerId ?? '');
  const [dieRoll, setDieRoll] = useState<number>();
  const [stepsDraft, setStepsDraft] = useState('1');
  const [overstep, setOverstep] = useState<'accidental' | 'safety'>();
  const [now, setNow] = useState(Date.now());
  const challenge = props.challenge;
  const status = challenge?.statusByPlayerId[selectedPlayerId];
  const remainingSeconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0;
  const canEdit = Boolean(selectedPlayerId && (props.viewerRole === 'host' || (props.viewerRole === 'seeker' && selectedPlayerId === props.viewerPlayerId)));
  const stepsTaken = Number(stepsDraft);
  const canReportSteps = Number.isInteger(stepsTaken) && stepsTaken >= 1 && stepsTaken <= 10000 &&
    (stepsTaken <= (status?.stepsRemaining ?? 0) || overstep !== undefined);
  const timeLabel = useMemo(() => {
    const minutes = Math.floor(remainingSeconds / 60);
    return `${minutes}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  }, [remainingSeconds]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (props.viewerRole === 'seeker' && props.viewerPlayerId) setSelectedPlayerId(props.viewerPlayerId);
    else if (!props.players.some((player) => player.playerId === selectedPlayerId)) setSelectedPlayerId(props.players[0]?.playerId ?? '');
  }, [props.viewerRole, props.viewerPlayerId, props.players, selectedPlayerId]);

  if (!challenge) return null;
  const expired = remainingSeconds <= 0;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>GAMBLER’S FEET</Text>
      <Text style={styles.copy}>{expired ? 'The step restriction has expired.' : `Active · ${timeLabel} remaining. Before walking, roll a six-sided die; you may take up to that many steps before rolling again.`}</Text>
      <Text style={styles.copy}>Each seeker tracks their own die. Roll again early to forfeit any unused steps. If you accidentally overstep, stop and keep rolling until those steps are accounted for. Safety steps are allowed.</Text>
      {props.viewerRole === 'host' ? (
        <View style={styles.row}>
          {props.players.map((player) => (
            <Pressable key={player.playerId} onPress={() => { setSelectedPlayerId(player.playerId); setDieRoll(undefined); }} style={[styles.player, selectedPlayerId === player.playerId ? styles.selected : null]}>
              <Text style={styles.playerText}>{player.displayName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selectedPlayerId ? (
        <>
          <Text style={styles.meta}>{props.players.find((player) => player.playerId === selectedPlayerId)?.displayName ?? 'Seeker'} · {status?.stepsRemaining ?? 0} steps available · {status?.unaccountedSteps ?? 0} unaccounted</Text>
          {canEdit && !expired ? (
            <>
              <Text style={styles.label}>{(status?.unaccountedSteps ?? 0) > 0 ? 'Roll to account for past steps' : 'Die result'}</Text>
              <View style={styles.row}>
                {[1, 2, 3, 4, 5, 6].map((value) => (
                  <Pressable key={value} onPress={() => setDieRoll(value)} style={[styles.die, dieRoll === value ? styles.dieSelected : null]}>
                    <Text style={styles.dieText}>{value}</Text>
                  </Pressable>
                ))}
              </View>
              <AppButton label={dieRoll ? `Record die roll: ${dieRoll}` : 'Choose die result'} disabled={props.disabled || dieRoll === undefined} onPress={() => { if (dieRoll !== undefined) { props.onRoll(selectedPlayerId, dieRoll); setDieRoll(undefined); } }} />
              {(status?.unaccountedSteps ?? 0) === 0 ? (
                <>
                  <Text style={styles.label}>Steps taken</Text>
                  <TextInput accessibilityLabel="Gambler’s Feet steps taken" keyboardType="number-pad" onChangeText={setStepsDraft} style={styles.input} value={stepsDraft} />
                  <View style={styles.row}>
                    {([{ label: 'Normal', value: undefined }, { label: 'Accidental', value: 'accidental' as const }, { label: 'Safety', value: 'safety' as const }]).map((item) => (
                      <Pressable key={item.label} onPress={() => setOverstep(item.value)} style={[styles.player, overstep === item.value ? styles.selected : null]}>
                        <Text style={styles.playerText}>{item.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <AppButton label="Record steps walked" tone="secondary" disabled={props.disabled || !canReportSteps} onPress={() => { if (canReportSteps) { props.onReportSteps(selectedPlayerId, stepsTaken, overstep); setOverstep(undefined); } }} />
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : <Text style={styles.copy}>Waiting for a seeker to join this round.</Text>}
      <Text style={styles.note}>Step counts, accidental oversteps, and safety exceptions are player-attested.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  meta: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  label: { color: colors.text, fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  die: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 9, borderColor: colors.border, backgroundColor: colors.surface },
  dieSelected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  dieText: { color: colors.text, fontWeight: '900' },
  player: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  playerText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }
});
