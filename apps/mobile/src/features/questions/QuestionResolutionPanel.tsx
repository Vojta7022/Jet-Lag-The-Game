import { StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition,
  VisibleConstraintProjection,
  VisibleMapProjection,
  VisibleQuestionProjection
} from '../../../../../packages/shared-types/src/index.ts';

import { formatResolutionMode, summarizeAnswer } from './question-catalog.ts';

import { colors } from '../../ui/theme.ts';

interface QuestionResolutionPanelProps {
  title: string;
  question?: VisibleQuestionProjection;
  template?: QuestionTemplateDefinition;
  category?: QuestionCategoryDefinition;
  constraint?: VisibleConstraintProjection;
  visibleMap?: VisibleMapProjection;
}

export function QuestionResolutionPanel(props: QuestionResolutionPanelProps) {
  const latestHistory = props.visibleMap?.history.at(-1);
  const constraint = props.constraint;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.title}</Text>
      {!props.question ? (
        <Text style={styles.copy}>No question has been recorded yet.</Text>
      ) : (
        <>
          <View style={styles.row}>
            <Text style={styles.label}>Question</Text>
            <Text style={styles.value}>{props.template?.name ?? props.question.templateId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Category</Text>
            <Text style={styles.value}>{props.category?.name ?? props.question.categoryId}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Answer</Text>
            <Text style={styles.value}>{summarizeAnswer(props.question.answer)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Resolution</Text>
            <Text style={styles.value}>{formatResolutionMode(constraint?.resolutionMode)}</Text>
          </View>
          {constraint ? (
            <>
              <Text style={styles.copy}>{constraint.explanation.summary}</Text>
              {constraint.explanation.detail ? (
                <Text style={styles.copy}>{constraint.explanation.detail}</Text>
              ) : null}
              {constraint.explanation.reasoningSteps.map((step, index) => (
                <Text key={`${constraint.constraintRecordId}:${index}`} style={styles.step}>
                  {index + 1}. {step}
                </Text>
              ))}
              <View style={styles.row}>
                <Text style={styles.label}>Confidence</Text>
                <Text style={styles.value}>{Math.round(constraint.confidenceScore * 100)}%</Text>
              </View>
            </>
          ) : (
            <Text style={styles.copy}>Constraint resolution is still pending.</Text>
          )}
          {latestHistory ? (
            <>
              <Text style={styles.copy}>Latest bounded map update: {latestHistory.summary}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Candidate Precision</Text>
                <Text style={styles.value}>{props.visibleMap?.remainingArea?.precision ?? 'none'}</Text>
              </View>
            </>
          ) : null}
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
  step: {
    color: colors.text,
    fontSize: 12,
    lineHeight: 17
  }
});
