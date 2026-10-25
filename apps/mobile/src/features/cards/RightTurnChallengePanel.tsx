import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

type PlayerRow = { playerId: string; displayName: string };
type RouteChoice = 'right' | 'straight' | 'left' | 'u_turn' | 'no_intersection';

interface RightTurnChallengePanelProps {
  challenge?: MatchProjection['rightTurnChallenge'];
  players: PlayerRow[];
  viewerRole?: MatchRole;
  viewerPlayerId?: string;
  disabled?: boolean;
  onReport: (playerId: string, choice: RouteChoice, atStreetIntersection: boolean, deadEndDistanceMeters?: number) => void;
}

const CHOICES: Array<{ choice: RouteChoice; label: string }> = [
  { choice: 'right', label: 'Turned right' },
  { choice: 'straight', label: 'Continued straight' },
  { choice: 'left', label: 'Turned left' },
  { choice: 'u_turn', label: 'Made a U-turn' },
  { choice: 'no_intersection', label: 'No street intersection' }
];

export function RightTurnChallengePanel(props: RightTurnChallengePanelProps) {
  const [selectedPlayerId, setSelectedPlayerId] = useState(props.viewerPlayerId ?? props.players[0]?.playerId ?? '');
  const [choice, setChoice] = useState<RouteChoice>();
  const [deadEndDistance, setDeadEndDistance] = useState('304');
  const [uTurnAtStreetIntersection, setUTurnAtStreetIntersection] = useState(false);
  const [now, setNow] = useState(Date.now());
  const challenge = props.challenge;
  const remainingSeconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0;
  const expired = remainingSeconds === 0;
  const deadEndDistanceMeters = Number(deadEndDistance);
  const canReport = Boolean(selectedPlayerId && choice && (choice !== 'u_turn' || Number.isFinite(deadEndDistanceMeters) && deadEndDistanceMeters >= challenge?.deadEndDistanceMeters!));
  const timeLabel = useMemo(() => `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`, [remainingSeconds]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (props.viewerRole === 'seeker' && props.viewerPlayerId) setSelectedPlayerId(props.viewerPlayerId);
    else if (!props.players.some((player) => player.playerId === selectedPlayerId)) setSelectedPlayerId(props.players[0]?.playerId ?? '');
  }, [props.viewerRole, props.viewerPlayerId, props.players, selectedPlayerId]);

  if (!challenge) return null;
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>CURSE OF THE RIGHT TURN</Text>
      <Text style={styles.copy}>{expired ? 'The route restriction has expired.' : `Active · ${timeLabel} remaining. At street intersections, seekers may turn right or continue straight.`}</Text>
      <Text style={styles.copy}>If neither continuing forward nor turning right is possible for {challenge.deadEndDistanceMeters} m, the rule allows a 180° turn. The restriction applies to car roads and their pedestrian sidewalks, not indoors or where there are no streets.</Text>
      {props.viewerRole === 'host' ? (
        <View style={styles.row}>
          {props.players.map((player) => (
            <Pressable key={player.playerId} onPress={() => setSelectedPlayerId(player.playerId)} style={[styles.chip, selectedPlayerId === player.playerId ? styles.selected : null]}>
              <Text style={styles.chipText}>{player.displayName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {selectedPlayerId && !expired ? (
        <>
          <Text style={styles.label}>Record this seeker’s route report</Text>
          <View style={styles.row}>
            {CHOICES.map((item) => (
              <Pressable key={item.choice} onPress={() => {
                setChoice(item.choice);
                if (item.choice === 'u_turn') setUTurnAtStreetIntersection(false);
              }} style={[styles.chip, choice === item.choice ? styles.selected : null]}>
                <Text style={styles.chipText}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
          {choice === 'u_turn' ? (
            <>
              <Text style={styles.label}>Where was the U-turn?</Text>
              <View style={styles.row}>
                {[{ label: 'At a street intersection', value: true }, { label: 'At the dead end', value: false }].map((item) => (
                  <Pressable key={item.label} onPress={() => setUTurnAtStreetIntersection(item.value)} style={[styles.chip, uTurnAtStreetIntersection === item.value ? styles.selected : null]}>
                    <Text style={styles.chipText}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.label}>Distance without a forward or right option (meters)</Text>
              <TextInput accessibilityLabel="Right Turn dead-end distance in meters" keyboardType="decimal-pad" onChangeText={setDeadEndDistance} style={styles.input} value={deadEndDistance} />
            </>
          ) : null}
          <AppButton label="Record route choice" disabled={props.disabled || !canReport} onPress={() => {
            if (!choice || !canReport) return;
            props.onReport(selectedPlayerId, choice, choice === 'u_turn' ? uTurnAtStreetIntersection : choice !== 'no_intersection', choice === 'u_turn' ? deadEndDistanceMeters : undefined);
            setChoice(undefined);
          }} />
        </>
      ) : null}
      <Text style={styles.label}>Recent route reports</Text>
      {challenge.reports.length ? challenge.reports.slice(-5).reverse().map((report, index) => (
        <Text key={`${report.reportedAt}:${index}`} style={styles.report}>
          {props.players.find((player) => player.playerId === report.playerId)?.displayName ?? 'Seeker'} · {CHOICES.find((item) => item.choice === report.choice)?.label ?? report.choice} · {report.compliant ? 'rule-following report' : 'rule exception reported'}
        </Text>
      )) : <Text style={styles.copy}>No route choices recorded yet.</Text>}
      <Text style={styles.note}>Route choices and dead-end distance are player attestations. The app records reports but cannot verify the street layout or enforce travel directions.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 12, fontWeight: '800' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  chipText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  report: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }
});
