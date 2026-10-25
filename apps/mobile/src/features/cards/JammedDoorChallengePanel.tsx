import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

type PlayerRow = { playerId: string; displayName: string };

interface JammedDoorChallengePanelProps {
  challenge?: MatchProjection['jammedDoorChallenge'];
  players: PlayerRow[];
  viewerRole?: MatchRole;
  viewerPlayerId?: string;
  disabled?: boolean;
  onRoll: (playerId: string, doorwayId: string, doorwayLabel: string, dieOne: number, dieTwo: number) => void;
}

function doorwayKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function formatClock(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

export function JammedDoorChallengePanel(props: JammedDoorChallengePanelProps) {
  const [doorwayLabel, setDoorwayLabel] = useState('');
  const [doorwayVisible, setDoorwayVisible] = useState(false);
  const [dieOne, setDieOne] = useState<number>();
  const [dieTwo, setDieTwo] = useState<number>();
  const [selectedPlayerId, setSelectedPlayerId] = useState(props.viewerPlayerId ?? props.players[0]?.playerId ?? '');
  const [now, setNow] = useState(Date.now());
  const challenge = props.challenge;
  const key = doorwayKey(doorwayLabel);
  const currentDoor = challenge?.statusByDoorwayId[key];
  const remainingSeconds = challenge ? Math.max(0, Math.ceil((Date.parse(challenge.expiresAt) - now) / 1000)) : 0;
  const cooldownSeconds = currentDoor?.retryAt ? Math.max(0, Math.ceil((Date.parse(currentDoor.retryAt) - now) / 1000)) : 0;
  const expired = remainingSeconds <= 0;
  const viewerCanReport = props.viewerRole === 'seeker' || props.viewerRole === 'host';
  const canReport = Boolean(
    challenge && viewerCanReport && !expired && doorwayVisible && key && doorwayLabel.trim().length >= 3 &&
    selectedPlayerId && dieOne && dieTwo && !currentDoor?.passedAt && cooldownSeconds === 0
  );
  const attempts = useMemo(() => Object.entries(challenge?.statusByDoorwayId ?? {}).sort((a, b) => a[1].doorwayLabel.localeCompare(b[1].doorwayLabel)), [challenge?.statusByDoorwayId]);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    if (props.viewerRole === 'seeker' && props.viewerPlayerId) setSelectedPlayerId(props.viewerPlayerId);
    else if (!props.players.some((player) => player.playerId === selectedPlayerId)) setSelectedPlayerId(props.players[0]?.playerId ?? '');
  }, [props.viewerRole, props.viewerPlayerId, props.players, selectedPlayerId]);

  if (!challenge) return null;
  const timer = formatClock(remainingSeconds);
  return (
    <View style={styles.panel}>
      <Text style={styles.title}>JAMMED DOOR</Text>
      <Text style={styles.copy}>{expired ? 'The doorway restriction has expired.' : `Active · ${timer} remaining. Before entering a building, business, train, or other vehicle, roll two six-sided dice. A total of ${challenge.minimumTotal} or higher lets the team through.`}</Text>
      <Text style={styles.copy}>{`Only roll once the doorway is visible. Doors between rooms in the same building need no roll; if it is unclear whether a doorway leads to a separate building, require the roll. If the roll is below ${challenge.minimumTotal}, everyone must wait ${challenge.retryCooldownMinutes} minutes before retrying that same doorway. Different doorways have separate attempts.`}</Text>
      {props.viewerRole === 'host' ? (
        <View style={styles.row}>
          {props.players.map((player) => (
            <Pressable key={player.playerId} onPress={() => setSelectedPlayerId(player.playerId)} style={[styles.chip, selectedPlayerId === player.playerId ? styles.selected : null]}>
              <Text style={styles.chipText}>{player.displayName}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {viewerCanReport && !expired ? (
        <>
          <Text style={styles.label}>Doorway name</Text>
          <TextInput accessibilityLabel="Jammed Door doorway name" onChangeText={(value) => { setDoorwayLabel(value); setDieOne(undefined); setDieTwo(undefined); }} placeholder="e.g. Central station east entrance" placeholderTextColor={colors.textMuted} style={styles.input} value={doorwayLabel} />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: doorwayVisible }} onPress={() => setDoorwayVisible((value) => !value)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, doorwayVisible ? styles.checkboxOn : null]}><Text style={styles.check}>{doorwayVisible ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>The doorway is visible to the seeker team now.</Text>
          </Pressable>
          <Text style={styles.label}>Die one · die two</Text>
          <View style={styles.dicePair}>
            {[{ value: dieOne, set: setDieOne, label: 'First die' }, { value: dieTwo, set: setDieTwo, label: 'Second die' }].map((die) => (
              <View key={die.label} style={styles.dieColumn}>
                <Text style={styles.meta}>{die.label}{die.value ? ` · ${die.value}` : ''}</Text>
                <View style={styles.row}>
                  {[1, 2, 3, 4, 5, 6].map((value) => (
                    <Pressable accessibilityLabel={`${die.label} ${value}`} key={value} onPress={() => die.set(value)} style={[styles.die, die.value === value ? styles.selected : null]}>
                      <Text style={styles.dieText}>{value}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </View>
          {currentDoor?.passedAt ? <Text style={styles.success}>{currentDoor.doorwayLabel} is open for the team · last roll {currentDoor.total}.</Text> : null}
          {cooldownSeconds > 0 ? <Text style={styles.warning}>Wait {formatClock(cooldownSeconds)} before retrying this doorway.</Text> : null}
          <AppButton label={dieOne && dieTwo ? `Record ${dieOne} + ${dieTwo} = ${dieOne + dieTwo}` : 'Choose both die results'} disabled={props.disabled || !canReport} onPress={() => { if (canReport && dieOne && dieTwo) props.onRoll(selectedPlayerId, key, doorwayLabel.trim(), dieOne, dieTwo); }} />
        </>
      ) : null}
      {attempts.length ? (
        <View style={styles.attempts}>
          <Text style={styles.label}>Doorway results</Text>
          {attempts.map(([doorwayId, attempt]) => (
            <Text key={doorwayId} style={styles.meta}>{attempt.doorwayLabel} · {attempt.total} {attempt.passedAt ? '· team passed' : `· retry ${attempt.retryAt ? formatClock(Math.max(0, Math.ceil((Date.parse(attempt.retryAt) - now) / 1000))) : 'available'}`}</Text>
          ))}
        </View>
      ) : null}
      <Text style={styles.note}>Door identity and visibility are seeker/referee attestations; the app tracks dice results and shared cooldowns.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 10, padding: 14, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 13, fontWeight: '900', letterSpacing: 1.1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19 },
  label: { color: colors.text, fontSize: 12, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dicePair: { gap: 8 },
  dieColumn: { gap: 5 },
  die: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 8, borderColor: colors.border, backgroundColor: colors.surface },
  dieText: { color: colors.text, fontWeight: '900' },
  chip: { paddingHorizontal: 9, paddingVertical: 7, borderRadius: 9, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  selected: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  chipText: { color: colors.text, fontSize: 11, fontWeight: '800' },
  input: { color: colors.text, borderWidth: 1, borderColor: colors.border, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, minHeight: 42 },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 22, height: 22, alignItems: 'center', justifyContent: 'center', borderRadius: 5, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  checkboxOn: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  check: { color: colors.accent, fontWeight: '900' },
  attempts: { gap: 5, paddingTop: 6, borderTopWidth: 1, borderTopColor: colors.border },
  success: { color: colors.success, fontSize: 12, fontWeight: '800' },
  warning: { color: colors.warning, fontSize: 12, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 11, lineHeight: 16 }
});
