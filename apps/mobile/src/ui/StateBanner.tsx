import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface StateBannerProps {
  tone: 'info' | 'error' | 'warning' | 'success';
  title: string;
  detail?: string;
}

export function StateBanner(props: StateBannerProps) {
  const toneStyle =
    props.tone === 'error'
      ? styles.error
      : props.tone === 'warning'
        ? styles.warning
        : props.tone === 'success'
          ? styles.success
          : styles.info;

  return (
    <View style={[styles.banner, toneStyle]}>
      <Text style={styles.title}>{props.title}</Text>
      {props.detail ? <Text style={styles.detail}>{props.detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    gap: 4,
    padding: 12
  },
  info: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  error: {
    backgroundColor: colors.dangerMuted,
    borderColor: colors.danger
  },
  warning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning
  },
  success: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  detail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
