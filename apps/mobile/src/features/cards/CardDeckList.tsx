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
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>{deckViewModel.deck.name}</Text>
                <Text style={styles.meta}>{formatDeckOwnerScope(deckViewModel.deck.ownerScope)}</Text>
              </View>
              {selected ? (
                <View style={styles.selectedChip}>
                  <Text style={styles.selectedChipLabel}>Open</Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.summary}>{summarizeVisibleDeckCounts(deckViewModel)}</Text>
            <CardZoneStats deck={deckViewModel} />
            <Text numberOfLines={3} style={styles.copy}>
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
    borderRadius: 24,
    borderWidth: 1,
    gap: 10,
    padding: 16,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.04,
    shadowRadius: 16,
    elevation: 2
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800'
  },
  meta: {
    color: colors.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase'
  },
  selectedChip: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5
  },
  selectedChipLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  summary: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18
  }
});
