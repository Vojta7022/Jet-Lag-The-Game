import { StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { describeEffectSupport, formatAutomationLevel } from './card-catalog.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface CardDetailPanelProps {
  card?: ResolvedVisibleCardModel;
  disabled?: boolean;
  lockReason?: string;
  canPlay: boolean;
  canDiscard: boolean;
  onPlay: () => void;
  onDiscard: () => void;
}

export function CardDetailPanel(props: CardDetailPanelProps) {
  const card = props.card;

  if (!card) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Select a visible card to inspect its details and available actions.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{card.definition.name}</Text>
      <Text style={styles.meta}>
        {card.definition.kind} · {formatAutomationLevel(card.definition.automationLevel)}
      </Text>
      <Text style={styles.meta}>Zone: {card.card.zone}</Text>
      <Text style={styles.meta}>Deck: {card.deck.name}</Text>
      <Text style={styles.copy}>{card.definition.description}</Text>
      <Text style={styles.copy}>{describeEffectSupport(card.definition)}</Text>
      {card.definition.effects.map((effect, index) => (
        <Text key={`${card.definition.cardDefinitionId}:effect:${index}`} style={styles.effect}>
          {index + 1}. {effect.description}
        </Text>
      ))}
      {card.definition.rewardsOrPenalties?.map((effect, index) => (
        <Text key={`${card.definition.cardDefinitionId}:penalty:${index}`} style={styles.effect}>
          {index + 1}. {effect.description}
        </Text>
      ))}
      {props.lockReason ? <Text style={styles.warning}>{props.lockReason}</Text> : null}
      <AppButton
        label="Play Card"
        onPress={props.onPlay}
        disabled={!props.canPlay || props.disabled}
      />
      <AppButton
        label="Discard Card"
        onPress={props.onDiscard}
        disabled={!props.canDiscard || props.disabled}
        tone="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  effect: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
