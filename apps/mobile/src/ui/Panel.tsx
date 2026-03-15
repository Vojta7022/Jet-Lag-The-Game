import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface PanelProps {
  title?: string;
  children: React.ReactNode;
}

export function Panel(props: PanelProps) {
  return (
    <View style={styles.panel}>
      {props.title ? <Text style={styles.title}>{props.title}</Text> : null}
      {props.children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    gap: 12
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  }
});
