import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';

import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface LuxuryCarChallengePanelProps {
  challenge: NonNullable<MatchProjection['luxuryCarChallenge']>;
  viewerRole?: MatchRole;
  photoAttachmentId?: string;
  disabled?: boolean;
  onSubmit: (car: { attachmentId: string; carDescription: string; productionYear: number; msrpCents: number }) => void;
  onDecide: (accepted: boolean) => void;
}

export function LuxuryCarChallengePanel(props: LuxuryCarChallengePanelProps) {
  const [carDescription, setCarDescription] = useState('');
  const [productionYear, setProductionYear] = useState('');
  const [msrp, setMsrp] = useState('');
  const parsedMsrpCents = Number(msrp.trim()) * 100;
  const canSubmit = Boolean(
    props.photoAttachmentId && carDescription.trim().length >= 2 &&
    /^(18[89]\d|19\d{2}|20\d{2}|2100)$/.test(productionYear) &&
    /^\d+(?:\.\d{1,2})?$/.test(msrp.trim()) &&
    Number.isSafeInteger(parsedMsrpCents) && parsedMsrpCents > props.challenge.hiderMsrpCents
  );
  const candidate = props.challenge.candidate;
  const formatMsrp = (cents: number) => `${props.challenge.currencyCode} ${(cents / 100).toFixed(2)}`;

  return (
    <View style={styles.container}>
      <Text style={styles.copy}>Hider car: {props.challenge.hiderCarDescription} ({props.challenge.hiderProductionYear}), MSRP {formatMsrp(props.challenge.hiderMsrpCents)}.</Text>
      <Text style={styles.copy}>Use the same currency and the photographed car’s original MSRP for its production year. Ignore modifications and paid upgrades.</Text>

      {candidate ? (
        <View style={styles.candidate}>
          <Text style={styles.title}>SEEKER CAR AWAITS REVIEW</Text>
          <Text style={styles.copy}>{candidate.carDescription} ({candidate.productionYear}), claimed MSRP {formatMsrp(candidate.msrpCents)}.</Text>
          <Text style={styles.copy}>The app confirms the claimed price exceeds the hider’s entry. The hider checks that the photo, model, year, and MSRP agree; uncertain details should be agreed by both teams.</Text>
          {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
            <View style={styles.actions}>
              <AppButton label="Accept higher-MSRP car" disabled={props.disabled} onPress={() => props.onDecide(true)} />
              <AppButton label="Reject and try again" tone="secondary" disabled={props.disabled} onPress={() => props.onDecide(false)} />
            </View>
          ) : null}
        </View>
      ) : (
        <Text style={styles.copy}>Waiting for a seeker to photograph a more expensive car.</Text>
      )}

      {props.viewerRole === 'seeker' && !candidate ? (
        <View style={styles.form}>
          <Text style={styles.title}>SEEKER CAR</Text>
          <TextInput accessibilityLabel="Seeker car description" onChangeText={setCarDescription} placeholder="Make and model" style={styles.input} value={carDescription} />
          <TextInput accessibilityLabel="Seeker car production year" keyboardType="number-pad" maxLength={4} onChangeText={setProductionYear} placeholder="Production year" style={styles.input} value={productionYear} />
          <TextInput accessibilityLabel="Seeker car MSRP" keyboardType="decimal-pad" onChangeText={setMsrp} placeholder={`MSRP in ${props.challenge.currencyCode}`} style={styles.input} value={msrp} />
          <Text style={styles.copy}>{props.photoAttachmentId ? 'Your new public photo is recorded.' : 'Take and record your car photo below before submitting.'}</Text>
          <AppButton
            label="Submit higher-MSRP car for review"
            disabled={props.disabled || !canSubmit}
            onPress={() => props.photoAttachmentId && props.onSubmit({
              attachmentId: props.photoAttachmentId,
              carDescription: carDescription.trim(),
              productionYear: Number(productionYear),
              msrpCents: parsedMsrpCents
            })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 10 },
  candidate: { backgroundColor: colors.surfaceMuted, borderRadius: 16, gap: 8, padding: 12 },
  actions: { gap: 8 },
  form: { backgroundColor: colors.surfaceRaised, borderRadius: 16, gap: 8, padding: 12 },
  title: { color: colors.text, fontSize: 12, fontWeight: '800' },
  copy: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  input: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, color: colors.text, paddingHorizontal: 12, paddingVertical: 10 }
});
