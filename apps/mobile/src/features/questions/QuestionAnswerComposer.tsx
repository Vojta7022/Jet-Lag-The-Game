import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../../../packages/shared-types/src/index.ts';
import type { GeoFeatureRecord } from '../../../../../packages/geo/src/index.ts';

import type { QuestionAnswerDraft } from './question-flow-state.ts';
import { getAnswerOptions } from './question-flow-state.ts';
import {
  describeExpectedAnswerGuidance,
  describeQuestionTemplateForPlayers
} from './question-guidance.ts';

import { Field } from '../../ui/Field.tsx';
import { colors } from '../../ui/theme.ts';

interface QuestionAnswerComposerProps {
  template: QuestionTemplateDefinition;
  category: QuestionCategoryDefinition;
  draft: QuestionAnswerDraft;
  candidateFeatures: GeoFeatureRecord[];
  disabled?: boolean;
  onChange: (draft: QuestionAnswerDraft) => void;
}

function OptionButton(props: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={[styles.option, props.selected ? styles.optionSelected : null, props.disabled ? styles.disabled : null]}
    >
      <Text style={styles.optionLabel}>{props.label}</Text>
    </Pressable>
  );
}

export function QuestionAnswerComposer(props: QuestionAnswerComposerProps) {
  const answerKind = String(props.template.answerSchema.kind ?? 'manual');
  const options = getAnswerOptions(props.template);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{props.template.name}</Text>
      <Text style={styles.copy}>Clue type: {props.category.name}</Text>
      <Text style={styles.copy}>Question: {describeQuestionTemplateForPlayers(props.template, props.category)}</Text>
      <View style={styles.guidanceCard}>
        <Text style={styles.guidanceTitle}>How to answer honestly</Text>
        <Text style={styles.copy}>{describeExpectedAnswerGuidance(props.template)}</Text>
      </View>

      {(answerKind === 'boolean' || answerKind === 'enum') ? (
        <View style={styles.optionList}>
          {options.map((option) => (
            <OptionButton
              key={option}
              label={option}
              selected={props.draft.selectedValue === option}
              disabled={props.disabled}
              onPress={() => props.onChange({ ...props.draft, selectedValue: option })}
            />
          ))}
        </View>
      ) : null}

      {answerKind === 'feature_choice' ? (
        <>
          {props.candidateFeatures.length > 0 ? (
            <View style={styles.optionList}>
              {props.candidateFeatures.map((feature) => (
                <OptionButton
                  key={feature.featureId}
                  label={feature.label}
                  selected={props.draft.selectedFeatureId === feature.featureId}
                  disabled={props.disabled}
                  onPress={() => props.onChange({ ...props.draft, selectedFeatureId: feature.featureId })}
                />
              ))}
            </View>
          ) : (
            <View style={styles.guidanceCard}>
              <Text style={styles.guidanceTitle}>No candidate list is available</Text>
              <Text style={styles.copy}>
                This region does not currently expose a candidate list for this clue. Enter the best honest place label you can, and the outcome may stay evidence-only until better place data is available.
              </Text>
              <Field
                label="Selected place"
                value={props.draft.selectedFeatureId}
                onChangeText={(selectedFeatureId) => props.onChange({ ...props.draft, selectedFeatureId })}
                placeholder="Place label"
              />
            </View>
          )}
        </>
      ) : null}

      {answerKind === 'attachment' ? (
        <>
          <Field
            label="Recorded evidence"
            value={props.draft.attachmentIdsText}
            onChangeText={(attachmentIdsText) => props.onChange({ ...props.draft, attachmentIdsText })}
            placeholder="Recorded evidence appears here"
          />
          <Field
            label="Evidence note"
            value={props.draft.note}
            onChangeText={(note) => props.onChange({ ...props.draft, note })}
            placeholder="Describe what the photo shows or what still needs review"
            autoCapitalize="sentences"
            multiline
            numberOfLines={3}
          />
          <Text style={styles.copy}>
            Use the evidence picker to choose or take a photo, then confirm the recorded attachment ids here. You can still type ids manually if another device or referee view already recorded the evidence.
          </Text>
        </>
      ) : null}

      {props.template.requirements?.length ? (
        <View style={styles.requirements}>
          {props.template.requirements.map((requirement, index) => (
            <Text key={`${requirement.requirementType}:${index}`} style={styles.requirement}>
              {requirement.description}
            </Text>
          ))}
        </View>
      ) : null}
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
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  guidanceCard: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: 12,
    gap: 6,
    padding: 12
  },
  guidanceTitle: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700'
  },
  optionList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  option: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  optionSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  optionLabel: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600'
  },
  requirements: {
    gap: 4
  },
  requirement: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  disabled: {
    opacity: 0.55
  }
});
