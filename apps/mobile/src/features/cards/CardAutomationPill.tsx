import { StyleSheet, Text, View } from 'react-native';

import type { CardUiTone } from './card-guidance.ts';

import { colors } from '../../ui/theme.ts';

interface CardAutomationPillProps {
  label: string;
  tone: CardUiTone;
}

export function CardAutomationPill(props: CardAutomationPillProps) {
  const toneStyle =
    props.tone === 'success'
      ? styles.success
      : props.tone === 'warning'
        ? styles.warning
        : styles.info;
  const labelStyle =
    props.tone === 'success'
      ? styles.successLabel
      : props.tone === 'warning'
        ? styles.warningLabel
        : styles.infoLabel;

  return (
    <View style={[styles.pill, toneStyle]}>
      <Text style={[styles.label, labelStyle]}>{props.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  success: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success
  },
  warning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning
  },
  info: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  label: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  successLabel: {
    color: colors.success
  },
  warningLabel: {
    color: colors.warning
  },
  infoLabel: {
    color: colors.accent
  }
});
