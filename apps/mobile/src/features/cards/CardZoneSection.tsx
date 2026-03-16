import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { CardAutomationPill } from './CardAutomationPill.tsx';
import {
  buildCardBehaviorModel,
  buildCardDescription,
  buildCardListSubtitle,
  formatCardKindLabel
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
            const accentStyle = resolveCardAccent(card.definition.kind);
            return (
              <Pressable
                key={card.card.cardInstanceId}
                accessibilityRole="button"
                onPress={() => props.onSelect(card.card.cardInstanceId)}
                style={[styles.item, selected ? styles.itemSelected : null]}
              >
                <View style={[styles.topStripe, accentStyle]} />
                <View style={styles.cardHeader}>
                  <View style={styles.cardText}>
                    <Text style={styles.kind}>{formatCardKindLabel(card.definition.kind)}</Text>
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
    gap: 10
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
    gap: 10
  },
  item: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    overflow: 'hidden',
    padding: 0
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  topStripe: {
    height: 8
  },
  topStripeTime: {
    backgroundColor: colors.accentWarm
  },
  topStripePower: {
    backgroundColor: colors.accent
  },
  topStripeCurse: {
    backgroundColor: colors.danger
  },
  topStripeBlank: {
    backgroundColor: colors.borderStrong
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12
  },
  cardText: {
    flex: 1,
    gap: 4
  },
  kind: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
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
    fontSize: 16,
    fontWeight: '800'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15
  },
  copy: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 19,
    paddingHorizontal: 14,
    paddingBottom: 14
  }
});

function resolveCardAccent(kind: ResolvedVisibleCardModel['definition']['kind']) {
  switch (kind) {
    case 'time_bonus':
      return styles.topStripeTime;
    case 'power_up':
      return styles.topStripePower;
    case 'curse':
      return styles.topStripeCurse;
    default:
      return styles.topStripeBlank;
  }
}
