import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleConstraintProjection,
  VisibleMapProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { ResolutionModePill } from './ResolutionModePill.tsx';
import { buildQuestionMapEffectModel } from './question-result-model.ts';

import { colors } from '../../ui/theme.ts';

interface QuestionResolutionPanelProps {
  title: string;
  question?: VisibleQuestionProjection;
  template?: QuestionTemplateDefinition;
  category?: QuestionCategoryDefinition;
  constraint?: VisibleConstraintProjection;
  visibleMap?: VisibleMapProjection;
  actionSlot?: ReactNode;
}

export function QuestionResolutionPanel(props: QuestionResolutionPanelProps) {
  const question = props.question;
  const model = buildQuestionMapEffectModel({
    question,
    template: props.template,
    category: props.category,
    constraint: props.constraint,
    visibleMap: props.visibleMap
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.title}</Text>
      {!question ? (
        <Text style={styles.copy}>No question has been recorded yet.</Text>
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.sectionTitle}>What changed</Text>
            <View style={styles.pillRow}>
              <ResolutionModePill
                label={model?.resolutionModeLabel ?? 'Pending'}
                tone={model?.resolutionTone ?? 'info'}
              />
              <ResolutionModePill
                label={model?.mapEffectModeLabel ?? 'Pending'}
                tone={model?.mapEffectTone ?? 'info'}
              />
            </View>
            <Text style={styles.impactTitle}>{model?.mapEffectTitle ?? 'Waiting for result'}</Text>
            <Text style={styles.copy}>{model?.mapEffectDetail ?? 'The latest question has not produced a visible result yet.'}</Text>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Question and answer</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Question</Text>
              <Text style={styles.value}>{model?.questionLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Category</Text>
              <Text style={styles.value}>{model?.categoryLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Recorded Answer</Text>
              <Text style={styles.value}>{model?.answerSummary}</Text>
            </View>
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Why the clue landed this way</Text>
            <Text style={styles.copy}>{model?.resolutionDetail}</Text>
            {props.constraint ? (
              <>
                <Text style={styles.copy}>{props.constraint.explanation.summary}</Text>
                {props.constraint.explanation.detail ? (
                  <Text style={styles.copy}>{props.constraint.explanation.detail}</Text>
                ) : null}
                <View style={styles.row}>
                  <Text style={styles.label}>Confidence</Text>
                  <Text style={styles.value}>{model?.confidenceLabel}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Visible clue layers</Text>
                  <Text style={styles.value}>{model?.artifactCountLabel}</Text>
                </View>
                {model?.contradictionSummary ? (
                  <Text style={styles.warningCopy}>
                    Contradiction detected: {model.contradictionSummary}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.copy}>The map has not been updated from this clue yet.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>How the map responded</Text>
            <Text style={styles.copy}>{model?.mapEffectDetail}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Visible boundary</Text>
              <Text style={styles.value}>{model?.candidatePrecisionLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Playable boundary check</Text>
              <Text style={styles.value}>{model?.boundedLabel}</Text>
            </View>
            {model?.historySummary ? (
              <Text style={styles.copy}>Latest map note: {model.historySummary}</Text>
            ) : null}
          </View>

          {model?.reasoningSteps.length ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>How the game explained it</Text>
              {model.reasoningSteps.map((step, index) => (
                <Text key={`${props.constraint?.constraintRecordId ?? question.questionInstanceId}:${index}`} style={styles.step}>
                  {index + 1}. {step}
                </Text>
              ))}
            </View>
          ) : null}

          {props.actionSlot ? <View style={styles.actionSlot}>{props.actionSlot}</View> : null}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 10
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  sectionCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 14,
    gap: 8,
    padding: 12
  },
  summaryCard: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 12
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between'
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600'
  },
  value: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'right'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  warningCopy: {
    color: colors.warning,
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 17
  },
  impactTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700'
  },
  step: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  },
  actionSlot: {
    gap: 8
  }
});
