import { StyleSheet, Text, View } from 'react-native';

import type { QuestionMapEffectModel } from '../questions/index.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

import { LiveMapInfoChips } from './LiveMapInfoChips.tsx';

interface LiveMapImpactCardProps {
  model: QuestionMapEffectModel;
  onOpenDetails?: () => void;
}

export function LiveMapImpactCard(props: LiveMapImpactCardProps) {
  const toneStyle = props.model.mapEffectTone === 'success'
    ? styles.cardSuccess
    : props.model.mapEffectTone === 'warning'
      ? styles.cardWarning
      : styles.cardInfo;

  return (
    <View style={[styles.card, toneStyle]}>
      <View style={styles.header}>
        <View style={styles.badge}>
          <Text style={styles.badgeLabel}>Latest clue impact</Text>
        </View>
        <Text style={styles.title}>{props.model.mapEffectTitle}</Text>
        <Text style={styles.detail}>{props.model.mapEffectDetail}</Text>
      </View>

      <LiveMapInfoChips
        items={[
          {
            label: 'Question',
            value: props.model.questionLabel,
            tone: 'default'
          },
          {
            label: 'Result',
            value: props.model.resolutionModeLabel,
            tone:
              props.model.resolutionTone === 'success'
                ? 'success'
                : props.model.resolutionTone === 'warning'
                  ? 'warning'
                  : 'accent'
          },
          {
            label: 'Map',
            value: props.model.mapEffectModeLabel,
            tone:
              props.model.mapEffectTone === 'success'
                ? 'success'
                : props.model.mapEffectTone === 'warning'
                  ? 'warning'
                  : 'accent'
          }
        ]}
      />

      <Text style={styles.answer}>Answer: {props.model.answerSummary}</Text>

      {props.onOpenDetails ? (
        <AppButton label="Clue Review" tone="secondary" onPress={props.onOpenDetails} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    gap: 14,
    padding: 16
  },
  cardInfo: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong
  },
  cardSuccess: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success
  },
  cardWarning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning
  },
  header: {
    gap: 6
  },
  badge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.surfaceRaised,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  badgeLabel: {
    color: colors.text,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase'
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  detail: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  answer: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
