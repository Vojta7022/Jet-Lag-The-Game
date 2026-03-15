import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { CardAutomationPill } from './CardAutomationPill.tsx';
import {
  buildCardBehaviorModel,
  buildCardDescription,
  buildCardListSubtitle
} from './card-guidance.ts';
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
      <View style={styles.header}>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.count}>{props.cards.length}</Text>
      </View>
      {props.cards.length === 0 ? (
        <Text style={styles.empty}>{props.emptyText}</Text>
      ) : (
        <View style={styles.list}>
          {props.cards.map((card) => {
            const selected = card.card.cardInstanceId === props.selectedCardInstanceId;
            const behavior = buildCardBehaviorModel(card.definition);
            return (
              <Pressable
                key={card.card.cardInstanceId}
                accessibilityRole="button"
                onPress={() => props.onSelect(card.card.cardInstanceId)}
                style={[styles.item, selected ? styles.itemSelected : null]}
              >
                <View style={styles.cardHeader}>
                  <View style={styles.cardText}>
                    <Text style={styles.name}>{card.definition.name}</Text>
                    <Text style={styles.meta}>{buildCardListSubtitle(card)}</Text>
                  </View>
                  <View style={styles.badgeGroup}>
                    <CardAutomationPill label={behavior.label} tone={behavior.tone} />
                    {selected ? (
                      <View style={styles.selectedChip}>
                        <Text style={styles.selectedChipLabel}>Selected</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.copy}>{buildCardDescription(card.definition)}</Text>
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
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  count: {
    color: colors.textMuted,
    fontSize: 12,
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
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  cardText: {
    flex: 1,
    gap: 4
  },
  badgeGroup: {
    alignItems: 'flex-end',
    gap: 6
  },
  selectedChip: {
    backgroundColor: colors.surface,
    borderColor: colors.accent,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4
  },
  selectedChipLabel: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase'
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
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  }
});
