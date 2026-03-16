import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface ScreenContainerProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function ScreenContainer(props: ScreenContainerProps) {
  return (
    <View style={styles.shell}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          {props.eyebrow ? <Text style={styles.eyebrow}>{props.eyebrow}</Text> : null}
          <Text style={styles.title}>{props.title}</Text>
          {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
        </View>
        {props.topSlot ? <View style={styles.topSlot}>{props.topSlot}</View> : null}
        {props.children}
      </ScrollView>
      {props.bottomSlot ? <View style={styles.bottomSlot}>{props.bottomSlot}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.background
  },
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 18,
    gap: 18
  },
  header: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 24,
    borderWidth: 1,
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 18,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.05,
    shadowRadius: 24,
    elevation: 2
  },
  eyebrow: {
    color: colors.accentStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase'
  },
  title: {
    fontSize: 31,
    fontWeight: '800',
    color: colors.text
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    color: colors.textMuted
  },
  topSlot: {
    gap: 12
  },
  bottomSlot: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    backgroundColor: colors.surfaceRaised,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.04,
    shadowRadius: 18,
    elevation: 3
  }
});
