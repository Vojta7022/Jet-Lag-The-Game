import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, fonts } from './theme.ts';

interface ScreenContainerProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  topSlot?: React.ReactNode;
  bottomSlot?: React.ReactNode;
  hideHeader?: boolean;
  children: React.ReactNode;
}

export function ScreenContainer(props: ScreenContainerProps) {
  return (
    <SafeAreaView
      style={styles.shell}
      edges={props.hideHeader ? ['top', 'bottom'] : ['bottom']}
    >
      <ScrollView
        style={styles.screen}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {!props.hideHeader ? (
          <View style={styles.header}>
            {props.eyebrow ? (
              <View style={styles.eyebrowRow}>
                <View style={styles.station} />
                <Text style={styles.eyebrow}>{props.eyebrow}</Text>
                <View style={styles.route} />
              </View>
            ) : null}
            <Text accessibilityRole="header" style={styles.title}>
              {props.title}
            </Text>
            {props.subtitle ? (
              <Text style={styles.subtitle}>{props.subtitle}</Text>
            ) : null}
          </View>
        ) : null}
        {props.topSlot ? (
          <View style={styles.topSlot}>{props.topSlot}</View>
        ) : null}
        {props.children}
      </ScrollView>
      {props.bottomSlot ? (
        <View style={styles.bottomSlot}>{props.bottomSlot}</View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: colors.background },
  screen: { flex: 1 },
  content: {
    padding: 20,
    gap: 24,
    width: '100%',
    maxWidth: 1080,
    alignSelf: 'center',
    paddingBottom: 32
  },
  header: { gap: 8, paddingVertical: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  station: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 3,
    borderColor: colors.accent
  },
  route: { height: 2, backgroundColor: colors.border, flex: 1 },
  eyebrow: {
    color: colors.accentStrong,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase'
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -1,
    color: colors.text
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted,
    maxWidth: 640
  },
  topSlot: { gap: 12 },
  bottomSlot: {
    backgroundColor: colors.ink,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 8
  }
});
