import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface PanelProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function Panel(props: PanelProps) {
  return (
    <View style={styles.panel}>
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
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 14,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 1
  },
  header: {
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
