import { StyleSheet, Text, View } from 'react-native';

import type { MatchRole, ScaleKey } from '../../../../../packages/shared-types/src/index.ts';

import type {
  CardZoneView,
  ResolvedVisibleCardModel
} from './card-catalog.ts';

import { CardAutomationPill } from './CardAutomationPill.tsx';
import {
  buildCardActionState,
  buildCardBehaviorModel,
  buildCardDescription,
  buildCardPurposeSummary,
  buildCardRequirementLines,
  buildCardRestrictionSummary,
  buildCardScaleNotes,
  buildCardTimingLines,
  formatCardKindLabel,
  formatZoneLabel
} from './card-guidance.ts';
import { buildScaleAwareTimeBonusDescription, type CardWorkbookPlayability } from './card-workbook-rules.ts';
import { describeEffectSupport } from './card-catalog.ts';
import { AppButton } from '../../ui/AppButton.tsx';
import { colors } from '../../ui/theme.ts';

interface CardDetailPanelProps {
  card?: ResolvedVisibleCardModel;
  viewerRole: MatchRole;
  selectedScale?: ScaleKey;
  workbookPlayability?: CardWorkbookPlayability;
  responseReason?: string;
  disabled?: boolean;
  lockReason?: string;
  canPlay: boolean;
  canDiscard: boolean;
  playDisabledReason?: string;
  discardDisabledReason?: string;
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

  const behavior = buildCardBehaviorModel(card.definition);
  const actionState = buildCardActionState({
    card,
    viewerRole: props.viewerRole,
    canPlay: props.canPlay,
    canDiscard: props.canDiscard,
    lockReason: props.lockReason
  });
  const requirementLines = buildCardRequirementLines(card.definition);
  const timingLines = buildCardTimingLines(card.definition);
  const scaleNotes = buildCardScaleNotes(card.definition);
  const activeScaleSummary = buildScaleAwareTimeBonusDescription(card.definition, props.selectedScale);
  const fallbackDescription = buildCardDescription(card.definition);
  const purposeSummary = buildCardPurposeSummary(card.definition);
  const restrictionSummary = buildCardRestrictionSummary(card.definition);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.headerText}>
          <Text style={styles.kind}>{formatCardKindLabel(card.definition.kind)}</Text>
          <Text style={styles.title}>{card.definition.name}</Text>
          <Text style={styles.meta}>
            {formatCardKindLabel(card.definition.kind)} · {formatZoneLabel(card.card.zone as CardZoneView)} · {card.deck.name}
          </Text>
        </View>
        <CardAutomationPill label={behavior.label} tone={behavior.tone} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What this card is for</Text>
        <Text style={styles.highlight}>{purposeSummary}</Text>
        <Text style={styles.copy}>{fallbackDescription}</Text>
        <Text style={styles.copy}>{behavior.detail}</Text>
        <Text style={styles.copy}>{describeEffectSupport(card.definition)}</Text>
        {activeScaleSummary ? <Text style={styles.effect}>{activeScaleSummary}</Text> : null}
        {scaleNotes.map((note, index) => (
          <Text key={`${card.definition.cardDefinitionId}:scale:${index}`} style={styles.effect}>
            {note}
          </Text>
        ))}
        {card.definition.effects.map((effect, index) => (
          <Text key={`${card.definition.cardDefinitionId}:effect:${index}`} style={styles.effect}>
            {index + 1}. {effect.description}
          </Text>
        ))}
        {card.definition.rewardsOrPenalties?.map((effect, index) => (
          <Text key={`${card.definition.cardDefinitionId}:penalty:${index}`} style={styles.effect}>
            Bonus / penalty {index + 1}. {effect.description}
          </Text>
        ))}
      </View>

      {(timingLines.length > 0 || requirementLines.length > 0) ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When it can be used</Text>
          <Text style={styles.copy}>{restrictionSummary}</Text>
          {timingLines.map((line, index) => (
            <Text key={`${card.definition.cardDefinitionId}:timing:${index}`} style={styles.meta}>
              {line}
            </Text>
          ))}
          {requirementLines.map((line, index) => (
            <Text key={`${card.definition.cardDefinitionId}:requirement:${index}`} style={styles.meta}>
              {line}
            </Text>
          ))}
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>What happens next</Text>
        <Text style={styles.copy}>{actionState.statusSummary}</Text>
        {props.workbookPlayability ? (
          <Text
            style={[
              styles.workbookStatus,
              props.workbookPlayability.tone === 'success'
                ? styles.workbookStatusSuccess
                : props.workbookPlayability.tone === 'warning'
                  ? styles.workbookStatusWarning
                  : null
            ]}
          >
            {props.workbookPlayability.label}: {props.workbookPlayability.detail}
          </Text>
        ) : null}
        {props.responseReason ? <Text style={styles.meta}>Response use: {props.responseReason}</Text> : null}
        {props.lockReason ? <Text style={styles.warning}>{props.lockReason}</Text> : null}
        {props.playDisabledReason ? <Text style={styles.meta}>Play: {props.playDisabledReason}</Text> : null}
        {props.discardDisabledReason ? <Text style={styles.meta}>Discard: {props.discardDisabledReason}</Text> : null}
      </View>

      <AppButton
        label="Play This Card"
        onPress={props.onPlay}
        disabled={!props.canPlay || props.disabled}
      />
      <AppButton
        label="Discard From Hand"
        onPress={props.onDiscard}
        disabled={!props.canDiscard || props.disabled}
        tone="secondary"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12
  },
  hero: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 20,
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    padding: 14
  },
  headerText: {
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
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 8,
    padding: 14
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  copy: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  highlight: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18
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
  workbookStatus: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17
  },
  workbookStatusSuccess: {
    color: colors.success
  },
  workbookStatusWarning: {
    color: colors.warning
  },
  empty: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  }
});
