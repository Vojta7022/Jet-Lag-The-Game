import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { MatchProjection, MatchRole } from '../../../../../packages/shared-types/src/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface RansomNoteChallengePanelProps {
  challenge?: MatchProjection['ransomNoteChallenge'];
  viewerRole?: MatchRole;
  disabled?: boolean;
  onSubmit: (noteText: string, printedCutoutsConfirmed: true) => void;
  onDecide: (accepted: boolean) => void;
}

export function RansomNoteChallengePanel(props: RansomNoteChallengePanelProps) {
  const [noteText, setNoteText] = useState('');
  const [printedCutoutsConfirmed, setPrintedCutoutsConfirmed] = useState(false);
  const challenge = props.challenge;
  if (!challenge) return null;
  const wordCount = noteText.trim().split(/\s+/u).filter(Boolean).length;

  return (
    <View style={styles.panel}>
      <Text style={styles.title}>RANSOM NOTE · QUESTION GATE</Text>
      {challenge.acceptedNoteText ? (
        <>
          <Text style={styles.copy}>The hider approved this physical cut-out note. Ask one normal clue using this exact wording:</Text>
          <Text style={styles.note}>{challenge.acceptedNoteText}</Text>
          <Text style={styles.helper}>The approved wording is consumed by the next question.</Text>
        </>
      ) : challenge.candidate ? (
        <>
          <Text style={styles.copy}>The seeker submitted this wording. The hider should inspect the actual paper cut-outs in person, then approve or reject it. The note must communicate the question without clarification.</Text>
          <Text style={styles.note}>{challenge.candidate.noteText}</Text>
          {props.viewerRole === 'hider' || props.viewerRole === 'host' ? (
            <View style={styles.actions}>
              <AppButton label="Approve cut-out question" disabled={props.disabled} onPress={() => props.onDecide(true)} />
              <AppButton label="Reject · seeker may retry" tone="secondary" disabled={props.disabled} onPress={() => props.onDecide(false)} />
            </View>
          ) : <Text style={styles.helper}>Waiting for the hider to review the physical note.</Text>}
        </>
      ) : props.viewerRole === 'seeker' ? (
        <>
          <Text style={styles.copy}>Write out the question made from printed cut-outs. The hider checks the physical note for coherent wording before you can ask it.</Text>
          <TextInput
            accessibilityLabel="Ransom Note question wording"
            multiline
            maxLength={500}
            onChangeText={setNoteText}
            placeholder="Type the exact five-word-or-more question"
            style={styles.input}
            value={noteText}
          />
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: printedCutoutsConfirmed }} onPress={() => setPrintedCutoutsConfirmed((value) => !value)} style={styles.checkboxRow}>
            <View style={[styles.checkbox, printedCutoutsConfirmed ? styles.checkboxOn : undefined]}><Text style={styles.check}>{printedCutoutsConfirmed ? '✓' : ''}</Text></View>
            <Text style={styles.copy}>These words are cut from printed material and form the note shown to the hider.</Text>
          </Pressable>
          <AppButton
            label={`Send to hider · ${wordCount}/5 words`}
            disabled={props.disabled || wordCount < 5 || !printedCutoutsConfirmed}
            onPress={() => props.onSubmit(noteText.trim(), true)}
          />
        </>
      ) : <Text style={styles.helper}>Waiting for a seeker to submit the cut-out question.</Text>}
      <Text style={styles.helper}>Physical cut-outs and coherence are checked by the players. The app records the wording and hider’s decision.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 9, padding: 13, borderRadius: 14, backgroundColor: colors.surfaceRaised, borderWidth: 1, borderColor: colors.border },
  title: { color: colors.accent, fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  copy: { color: colors.text, fontSize: 13, lineHeight: 19, flex: 1 },
  note: { color: colors.text, fontSize: 16, lineHeight: 23, fontWeight: '800', padding: 12, borderRadius: 10, backgroundColor: colors.surface },
  helper: { color: colors.textMuted, fontSize: 11, lineHeight: 16 },
  input: { minHeight: 88, textAlignVertical: 'top', padding: 12, borderRadius: 10, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  checkbox: { width: 21, height: 21, borderRadius: 5, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  checkboxOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  check: { color: colors.text, fontWeight: '900' },
  actions: { gap: 7 }
});
