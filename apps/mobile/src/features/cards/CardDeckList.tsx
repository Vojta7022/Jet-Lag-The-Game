import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MatchRole } from '../../../../../packages/shared-types/src/index.ts';

import type { DeckViewModel } from './card-catalog.ts';
import { CardZoneStats } from './CardZoneStats.tsx';
import {
  describeDeckVisibility,
  formatDeckOwnerScope,
  summarizeVisibleDeckCounts
} from './card-guidance.ts';

import { colors } from '../../ui/theme.ts';

interface CardDeckListProps {
  decks: DeckViewModel[];
  selectedDeckId?: string;
  viewerRole?: MatchRole;
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
            <Text style={styles.meta}>{formatDeckOwnerScope(deckViewModel.deck.ownerScope)}</Text>
            <Text style={styles.copy}>{summarizeVisibleDeckCounts(deckViewModel)}</Text>
            <CardZoneStats deck={deckViewModel} />
            <Text style={styles.copy}>
              {describeDeckVisibility(deckViewModel.deck, props.viewerRole ?? 'spectator')}
            </Text>
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
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 20,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
  },
  meta: {
    color: colors.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
