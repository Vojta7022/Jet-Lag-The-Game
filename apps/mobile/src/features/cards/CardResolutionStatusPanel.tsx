import { StyleSheet, Text, View } from 'react-native';

import type { ResolvedVisibleCardModel } from './card-catalog.ts';

import { CardAutomationPill } from './CardAutomationPill.tsx';
import {
  buildCardBehaviorModel,
  buildResolutionWindowGuidance,
  formatCardKindLabel
} from './card-guidance.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface CardResolutionStatusPanelProps {
  activeCard?: ResolvedVisibleCardModel;
  disabled?: boolean;
  canResolve: boolean;
  resolveDisabledReason?: string;
  onResolve: () => void;
}

export function CardResolutionStatusPanel(props: CardResolutionStatusPanelProps) {
  const guidance = buildResolutionWindowGuidance(props.activeCard, props.canResolve);
  const behavior = props.activeCard ? buildCardBehaviorModel(props.activeCard.definition) : undefined;

  return (
    <View style={styles.container}>
      {!props.activeCard ? (
        <>
          <Text style={styles.title}>{guidance.title}</Text>
          <Text style={styles.copy}>{guidance.detail}</Text>
          <Text style={styles.copy}>{guidance.nextStep}</Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>{guidance.title}</Text>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.cardName}>{props.activeCard.definition.name}</Text>
              <Text style={styles.copy}>
                {formatCardKindLabel(props.activeCard.definition.kind)} from {props.activeCard.deck.name}
              </Text>
            </View>
            {behavior ? <CardAutomationPill label={behavior.label} tone={behavior.tone} /> : null}
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Why the hand is locked</Text>
            <Text style={styles.copy}>{guidance.detail}</Text>
            <Text style={styles.copy}>
              This window stays open until an allowed role resolves it. The app is tracking the lock honestly instead of inventing a timer or auto-result.
            </Text>
          </View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How to continue play</Text>
            <Text style={styles.copy}>{guidance.nextStep}</Text>
            <Text style={styles.copy}>
              Players or a referee still need to handle any unresolved manual steps themselves before the match can continue.
            </Text>
            {props.resolveDisabledReason ? (
              <Text style={styles.warning}>{props.resolveDisabledReason}</Text>
            ) : null}
          </View>
          <AppButton
            label="Close Resolution Window"
            onPress={props.onResolve}
            disabled={!props.canResolve || props.disabled}
          />
        </>
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
    fontSize: 15,
    fontWeight: '700'
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  headerText: {
    flex: 1,
    gap: 4
  },
  cardName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  section: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 6,
    padding: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  }
});
