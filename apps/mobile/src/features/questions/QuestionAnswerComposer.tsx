import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../../../packages/shared-types/src/index.ts';
import type { GeoFeatureRecord } from '../../../../../packages/geo/src/index.ts';

import type { QuestionAnswerDraft } from './question-flow-state.ts';
import { getAnswerOptions } from './question-flow-state.ts';

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
      <Text style={styles.copy}>Category: {props.category.name}</Text>

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
            <Field
              label="Selected Feature Id or Label"
              value={props.draft.selectedFeatureId}
              onChangeText={(selectedFeatureId) => props.onChange({ ...props.draft, selectedFeatureId })}
              placeholder="Feature id or label"
            />
          )}
        </>
      ) : null}

      {answerKind === 'attachment' ? (
        <>
          <Field
            label="Attachment Placeholder Ids"
            value={props.draft.attachmentIdsText}
            onChangeText={(attachmentIdsText) => props.onChange({ ...props.draft, attachmentIdsText })}
            placeholder="photo-1, photo-2"
          />
          <Field
            label="Manual Evidence Note"
            value={props.draft.note}
            onChangeText={(note) => props.onChange({ ...props.draft, note })}
            placeholder="Describe the evidence until upload UI exists"
            autoCapitalize="sentences"
          />
          <Text style={styles.copy}>
            Photo flows are manual in this phase. The answer records placeholder ids and notes without pretending to create geometry.
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
