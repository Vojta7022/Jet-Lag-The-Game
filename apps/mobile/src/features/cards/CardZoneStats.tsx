import { StyleSheet, Text, View } from 'react-native';

import type { DeckViewModel } from './card-catalog.ts';

import { colors } from '../../ui/theme.ts';

interface CardZoneStatsProps {
  deck: DeckViewModel;
}

export function CardZoneStats(props: CardZoneStatsProps) {
  const items = [
    ['Hand', props.deck.visibleByZone.hand.length],
    ['Draw', props.deck.visibleByZone.draw_pile.length],
    ['Discard', props.deck.visibleByZone.discard_pile.length],
    ['Exile', props.deck.visibleByZone.exile.length],
    ['Pending', props.deck.visibleByZone.pending_resolution.length]
  ];

  return (
    <View style={styles.row}>
      {items.map(([label, count]) => (
        <View key={label} style={styles.chip}>
          <Text style={styles.count}>{count}</Text>
          <Text style={styles.label}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  count: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  label: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase'
  }
});
