import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from './theme.ts';

interface PanelProps {
  title?: string;
  subtitle?: string;
  tone?: 'default' | 'accent' | 'soft';
  children: React.ReactNode;
}

export function Panel(props: PanelProps) {
  const toneStyle = props.tone === 'accent'
    ? styles.panelAccent
    : props.tone === 'soft'
      ? styles.panelSoft
      : styles.panelDefault;

  return (
    <View style={[styles.panel, toneStyle]}>
      {props.title || props.subtitle ? (
        <View style={styles.header}>
          {props.title ? <Text style={styles.title}>{props.title}</Text> : null}
          {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
        </View>
      ) : null}
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2
  },
  panelDefault: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border
  },
  panelAccent: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  panelSoft: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.borderStrong
  },
  header: {
    gap: 5
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 23,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
