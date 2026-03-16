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
      <View style={styles.header}>
        <View style={[styles.dot, toneDotStyle(props.tone)]} />
        <Text style={styles.title}>{props.title}</Text>
      </View>
      {props.detail ? <Text style={styles.detail}>{props.detail}</Text> : null}
    </View>
  );
}

function toneDotStyle(tone: StateBannerProps['tone']) {
  return tone === 'error'
    ? styles.errorDot
    : tone === 'warning'
      ? styles.warningDot
      : tone === 'success'
        ? styles.successDot
        : styles.infoDot;
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8
  },
  dot: {
    borderRadius: 999,
    height: 8,
    width: 8
  },
  infoDot: {
    backgroundColor: colors.accent
  },
  errorDot: {
    backgroundColor: colors.danger
  },
  warningDot: {
    backgroundColor: colors.warning
  },
  successDot: {
    backgroundColor: colors.success
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800'
  },
  detail: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
