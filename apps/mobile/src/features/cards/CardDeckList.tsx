import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { DeckViewModel } from './card-catalog.ts';

import { colors } from '../../ui/theme.ts';

interface CardDeckListProps {
  decks: DeckViewModel[];
  selectedDeckId?: string;
  onSelect: (deckId: string) => void;
}

export function CardDeckList(props: CardDeckListProps) {
  return (
    <View style={styles.list}>
      {props.decks.map((deckViewModel) => {
        const selected = deckViewModel.deck.deckId === props.selectedDeckId;
        return (
          <Pressable
            key={deckViewModel.deck.deckId}
            accessibilityRole="button"
            onPress={() => props.onSelect(deckViewModel.deck.deckId)}
            style={[styles.item, selected ? styles.itemSelected : null]}
          >
            <Text style={styles.title}>{deckViewModel.deck.name}</Text>
            <Text style={styles.meta}>{deckViewModel.deck.ownerScope}</Text>
            <View style={styles.countRow}>
              <Text style={styles.count}>Hand {deckViewModel.visibleByZone.hand.length}</Text>
              <Text style={styles.count}>Draw {deckViewModel.visibleByZone.draw_pile.length}</Text>
              <Text style={styles.count}>Discard {deckViewModel.visibleByZone.discard_pile.length}</Text>
              <Text style={styles.count}>Exile {deckViewModel.visibleByZone.exile.length}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10
  },
  item: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12
  },
  countRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  count: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '600'
  }
});
