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
          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Answer</Text>
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
            <Text style={styles.sectionTitle}>Constraint Interpretation</Text>
            <ResolutionModePill
              label={model?.resolutionModeLabel ?? 'Pending'}
              tone={model?.resolutionTone ?? 'info'}
            />
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
                  <Text style={styles.label}>Visible Artifacts</Text>
                  <Text style={styles.value}>{model?.artifactCountLabel}</Text>
                </View>
                {model?.contradictionSummary ? (
                  <Text style={styles.warningCopy}>
                    Contradiction detected: {model.contradictionSummary}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.copy}>Constraint resolution is still pending.</Text>
            )}
          </View>

          <View style={styles.sectionCard}>
            <Text style={styles.sectionTitle}>Map Effect</Text>
            <ResolutionModePill
              label={model?.mapEffectModeLabel ?? 'Pending'}
              tone={model?.mapEffectTone ?? 'info'}
            />
            <Text style={styles.impactTitle}>{model?.mapEffectTitle}</Text>
            <Text style={styles.copy}>{model?.mapEffectDetail}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Candidate Precision</Text>
              <Text style={styles.value}>{model?.candidatePrecisionLabel}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Playable-Region Clipping</Text>
              <Text style={styles.value}>{model?.boundedLabel}</Text>
            </View>
            {model?.historySummary ? (
              <Text style={styles.copy}>Latest map update: {model.historySummary}</Text>
            ) : null}
          </View>

          {model?.reasoningSteps.length ? (
            <View style={styles.sectionCard}>
              <Text style={styles.sectionTitle}>Why This Happened</Text>
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
  sectionTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700'
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
