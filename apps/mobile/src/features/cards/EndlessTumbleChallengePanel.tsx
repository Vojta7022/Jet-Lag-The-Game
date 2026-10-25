import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface EndlessTumbleChallengePanelProps {
  challenge?: MatchProjection['endlessTumbleChallenge'];
  viewerRole?: MatchRole;
  disabled?: boolean;
  awardedCurseBonusMinutes?: number;
  onReport: (dieRoll: number | null, distanceMeters: number, unaided: boolean, landsCleanly: boolean, hitPerson: boolean) => void;
}

export function EndlessTumbleChallengePanel(props: EndlessTumbleChallengePanelProps) {
  const [dieRoll, setDieRoll] = useState<number | null | undefined>();
  const [distance, setDistance] = useState('30');
  const [unaided, setUnaided] = useState<boolean | undefined>();
  const [landsCleanly, setLandsCleanly] = useState<boolean | undefined>();
  const [hitPerson, setHitPerson] = useState<boolean | undefined>();
  const challenge = props.challenge;
  if (!challenge) return null;

  const distanceMeters = Number(distance);
  const canReport = (props.viewerRole === 'seeker' || props.viewerRole === 'host') && !challenge.successfulRollAt &&
    dieRoll !== undefined && Number.isFinite(distanceMeters) && distanceMeters >= 0 && distanceMeters <= 10000 &&
    unaided !== undefined && landsCleanly !== undefined && hitPerson !== undefined;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>ENDLESS TUMBLE</Text>
      <Text style={styles.copy}>
        {challenge.successfulRollAt
          ? 'Challenge cleared. The seekers can ask their next question.'
          : `Questions are locked until a seeker reports ${challenge.successfulDieResults.join(' or ')} after an unaided die roll of at least ${challenge.minimumDistanceMeters} m.`}
      </Text>
      <Text style={styles.meta}>{challenge.reportedAttempts} roll{challenge.reportedAttempts === 1 ? '' : 's'} reported · {challenge.hiderBonusMinutes} min hider bonus per hit</Text>
      <Text style={styles.meta}>Curse bonus earned this round: {props.awardedCurseBonusMinutes ?? 0} min</Text>
      {!challenge.successfulRollAt && (props.viewerRole === 'seeker' || props.viewerRole === 'host') ? (
        <>
          <Text style={styles.label}>Die result</Text>
          <View style={styles.row}>
            {[1, 2, 3, 4, 5, 6].map((value) => (
              <Pressable key={value} onPress={() => setDieRoll(value)} style={[styles.die, dieRoll === value ? styles.dieSelected : null]}>
                <Text style={[styles.dieText, dieRoll === value ? styles.dieTextSelected : null]}>{value}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable
            onPress={() => { setDieRoll(null); setLandsCleanly(false); }}
            style={[styles.toggle, dieRoll === null ? styles.hitSelected : null]}
          >
            <Text style={styles.toggleText}>{dieRoll === null ? '✓ Lost / no clean face' : 'Lost / no clean face'}</Text>
          </Pressable>
          <Text style={styles.label}>Measured roll distance (m)</Text>
          <TextInput
            accessibilityLabel="Endless Tumble roll distance in meters"
            keyboardType="decimal-pad"
            onChangeText={setDistance}
            style={styles.input}
            value={distance}
          />
          <Text style={styles.label}>Did it travel unaided?</Text>
          <View style={styles.row}>
            {[true, false].map((value) => (
              <Pressable key={`unaided-${value}`} onPress={() => setUnaided(value)} style={[styles.toggle, unaided === value ? styles.toggleSelected : null]}>
                <Text style={styles.toggleText}>{value ? 'Unaided' : 'Assisted'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Did it land cleanly on one side?</Text>
          <View style={styles.row}>
            {[true, false].map((value) => (
              <Pressable key={`clean-${value}`} onPress={() => setLandsCleanly(value)} style={[styles.toggle, landsCleanly === value ? value ? styles.toggleSelected : styles.hitSelected : null]}>
                <Text style={styles.toggleText}>{value ? 'Clean landing' : 'Did not land cleanly'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.label}>Did it hit someone?</Text>
          <View style={styles.row}>
            {[true, false].map((value) => (
              <Pressable key={`hit-${value}`} onPress={() => setHitPerson(value)} style={[styles.toggle, hitPerson === value ? value ? styles.hitSelected : styles.toggleSelected : null]}>
                <Text style={styles.toggleText}>{value ? 'Hit someone' : 'No hit'}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.note}>Attest that the die traveled the full distance parallel to the ground using only the initial throw and gravity. Report any hit immediately.</Text>
          <AppButton
            label="Record Die Roll"
            disabled={!canReport || props.disabled}
            onPress={() => {
              if (dieRoll !== undefined && canReport && unaided !== undefined && landsCleanly !== undefined && hitPerson !== undefined) {
                props.onReport(dieRoll, distanceMeters, unaided, landsCleanly, hitPerson);
              }
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { backgroundColor: colors.surfaceMuted, borderColor: colors.border, borderRadius: 18, borderWidth: 1, gap: 10, padding: 14 },
  title: { color: colors.text, fontSize: 15, fontWeight: '900', letterSpacing: 1.2 },
  copy: { color: colors.text, fontSize: 14, lineHeight: 20 },
  meta: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  label: { color: colors.text, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  row: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  die: { alignItems: 'center', backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, height: 42, justifyContent: 'center', width: 42 },
  dieSelected: { backgroundColor: colors.signal, borderColor: colors.signal },
  dieText: { color: colors.text, fontSize: 16, fontWeight: '900' },
  dieTextSelected: { color: colors.ink },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, fontSize: 16, padding: 12 },
  toggle: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  toggleSelected: { borderColor: colors.signal, backgroundColor: colors.warningMuted },
  hitSelected: { borderColor: colors.danger, backgroundColor: colors.dangerMuted },
  toggleText: { color: colors.text, fontSize: 12, fontWeight: '800' },
  note: { color: colors.textMuted, fontSize: 12, lineHeight: 18 }
});
