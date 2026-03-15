import { StyleSheet, Text, View } from 'react-native';

import { colors } from './theme.ts';

interface FactItem {
  label: string;
  value: React.ReactNode;
}

interface FactListProps {
  items: FactItem[];
}

export function FactList(props: FactListProps) {
  return (
    <View style={styles.list}>
      {props.items.map((item) => (
        <View key={item.label} style={styles.row}>
          <Text style={styles.label}>{item.label}</Text>
          <View style={styles.valueWrap}>
            {typeof item.value === 'string' || typeof item.value === 'number' ? (
              <Text style={styles.value}>{String(item.value)}</Text>
            ) : (
              item.value
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10
  },
  row: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.2,
    textTransform: 'uppercase'
  },
  valueWrap: {
    flex: 1,
    alignItems: 'flex-end'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'right'
  }
});
