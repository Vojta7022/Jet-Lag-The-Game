import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface ScreenContainerProps {
  title: string;
  subtitle?: string;
  topSlot?: React.ReactNode;
  children: React.ReactNode;
}

export function ScreenContainer(props: ScreenContainerProps) {
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title}>{props.title}</Text>
        {props.subtitle ? <Text style={styles.subtitle}>{props.subtitle}</Text> : null}
      </View>
      {props.topSlot ? <View style={styles.topSlot}>{props.topSlot}</View> : null}
      {props.children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: 16,
    gap: 16
  },
  header: {
    gap: 6,
    paddingTop: 4
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.text
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textMuted
  },
  topSlot: {
    gap: 12
  }
});
