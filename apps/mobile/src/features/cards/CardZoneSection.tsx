import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { formatAutomationLevel } from './card-catalog.ts';
import { colors } from '../../ui/theme.ts';

interface CardZoneSectionProps {
  title: string;
  cards: ResolvedVisibleCardModel[];
  emptyText: string;
  selectedCardInstanceId?: string;
  onSelect: (cardInstanceId: string) => void;
}

export function CardZoneSection(props: CardZoneSectionProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.title}</Text>
      {props.cards.length === 0 ? (
        <Text style={styles.empty}>{props.emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {props.cards.map((card) => {
            const selected = card.card.cardInstanceId === props.selectedCardInstanceId;
            return (
              <Pressable
                key={card.card.cardInstanceId}
                accessibilityRole="button"
                onPress={() => props.onSelect(card.card.cardInstanceId)}
                style={[styles.item, selected ? styles.itemSelected : null]}
              >
                <Text style={styles.name}>{card.definition.name}</Text>
                <Text style={styles.meta}>
                  {card.definition.kind} · {formatAutomationLevel(card.definition.automationLevel)}
                </Text>
                <Text style={styles.meta}>{card.card.cardInstanceId}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  list: {
    gap: 8
  },
  item: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 10
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  name: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  }
});
