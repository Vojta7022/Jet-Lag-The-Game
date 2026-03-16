import { StyleSheet, Text, View } from 'react-native';

import type { MatchProjection } from '../../../../../packages/shared-types/src/index.ts';
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
  resolution?: MatchProjection['activeCardResolution'];
  disabled?: boolean;
  canResolve: boolean;
  resolveDisabledReason?: string;
  onResolve: () => void;
}

export function CardResolutionStatusPanel(props: CardResolutionStatusPanelProps) {
  const guidance = buildResolutionWindowGuidance(props.activeCard, props.canResolve);
  const behavior = props.activeCard ? buildCardBehaviorModel(props.activeCard.definition) : undefined;
  const discardRequirement = props.resolution?.discardRequirement;
  const discardDetail = discardRequirement?.discardWholeHand
    ? 'Discard the rest of the opening hand before closing this window.'
    : discardRequirement?.requiredCards
      ? discardRequirement.requiredKind
        ? `Discard ${discardRequirement.requiredCards} ${discardRequirement.requiredKind.replace(/_/g, ' ')} card${discardRequirement.requiredCards === 1 ? '' : 's'} first.`
        : `Discard ${discardRequirement.requiredCards} other card${discardRequirement.requiredCards === 1 ? '' : 's'} first.`
      : undefined;
  const followThroughDetail = props.resolution?.drawCountOnResolve
    ? `Closing this window draws ${props.resolution.drawCountOnResolve} replacement card${props.resolution.drawCountOnResolve === 1 ? '' : 's'}.`
    : props.resolution?.timeBonusMinutes
      ? `This effect adds ${props.resolution.timeBonusMinutes} minute${props.resolution.timeBonusMinutes === 1 ? '' : 's'} to the hide timer.`
      : undefined;

  if (!props.activeCard) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{guidance.title}</Text>
        <Text style={styles.copy}>{guidance.detail}</Text>
        <Text style={styles.copy}>{guidance.nextStep}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
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
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Lock</Text>
        <Text style={styles.copy}>{guidance.detail}</Text>
        {discardDetail ? <Text style={styles.metaChip}>{discardDetail}</Text> : null}
        {followThroughDetail ? <Text style={styles.metaChip}>{followThroughDetail}</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Next step</Text>
        <Text style={styles.copy}>{guidance.nextStep}</Text>
        {props.resolveDisabledReason ? (
          <Text style={styles.warning}>{props.resolveDisabledReason}</Text>
        ) : null}
      </View>

      <AppButton
        label="Close Card Window"
        onPress={props.onResolve}
        disabled={!props.canResolve || props.disabled}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 18,
    gap: 10,
    padding: 14
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800'
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
    backgroundColor: colors.surfaceRaised,
    borderRadius: 18,
    gap: 8,
    padding: 14
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
  metaChip: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    color: colors.text,
    fontSize: 12,
    lineHeight: 17,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  warning: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  }
});
