import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../../../packages/shared-types/src/index.ts';

import { ResolutionModePill } from './ResolutionModePill.tsx';
import {
  describeExpectedAnswerGuidance,
  describeQuestionImpactExpectation,
  describeQuestionTemplateForPlayers,
  describeWorkbookAvailability,
  describeWorkbookRequirementSummary,
  describeWorkbookRuleSummary,
  formatQuestionScaleSet
} from './question-guidance.ts';

import { colors } from '../../ui/theme.ts';

interface QuestionTemplateListProps {
  templates: QuestionTemplateDefinition[];
  category: QuestionCategoryDefinition;
  selectedTemplateId?: string;
  selectedTemplateIds?: string[];
  regionId?: string;
  selectionLimit?: number;
  describeSupport: (template: QuestionTemplateDefinition, category: QuestionCategoryDefinition) => string;
  onSelect: (templateId: string) => void;
}

export function QuestionTemplateList(props: QuestionTemplateListProps) {
  const selectedTemplateIds = new Set(
    props.selectedTemplateIds ?? (props.selectedTemplateId ? [props.selectedTemplateId] : [])
  );

  return (
    <View style={styles.list}>
      {props.templates.map((template) => {
        const selected = selectedTemplateIds.has(template.templateId);
        const featureLabels = (template.featureClassRefs ?? [])
          .map((feature) => feature.label?.trim())
          .filter((label): label is string => Boolean(label))
          .join(', ');
        const impact = describeQuestionImpactExpectation({
          template,
          category: props.category,
          regionId: props.regionId
        });
        const workbookRequirement = describeWorkbookRequirementSummary(template);
        const workbookRule = describeWorkbookRuleSummary(template, props.category);
        const workbookAvailability = describeWorkbookAvailability(template);

        return (
          <Pressable
            key={template.templateId}
            accessibilityRole="button"
            onPress={() => props.onSelect(template.templateId)}
            style={[styles.item, selected ? styles.itemSelected : null]}
          >
            <View style={styles.header}>
              <Text style={styles.title}>{template.name}</Text>
              {selected ? (
                <Text style={styles.selectionTag}>
                  {props.selectionLimit && props.selectionLimit > 1 ? 'Kept' : 'Ready'}
                </Text>
              ) : null}
            </View>
            <ResolutionModePill label={impact.label} tone={impact.tone} />
            <Text style={styles.copy}>{describeQuestionTemplateForPlayers(template, props.category)}</Text>
            <Text style={styles.meta}>Workbook rule: {workbookRule}</Text>
            <Text style={styles.meta}>How to answer: {describeExpectedAnswerGuidance(template)}</Text>
            <Text style={styles.meta}>What usually happens: {impact.detail}</Text>
            {workbookRequirement ? <Text style={styles.meta}>Workbook requirement: {workbookRequirement}</Text> : null}
            {featureLabels ? <Text style={styles.support}>Places involved: {featureLabels}</Text> : null}
            <Text style={styles.support}>Availability: {workbookAvailability}</Text>
            <Text style={styles.support}>Best for: {formatQuestionScaleSet(template.scaleSet.appliesTo)}</Text>
            <Text style={styles.support}>How it behaves today: {props.describeSupport(template, props.category)}.</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10
  },
  item: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 14,
    borderWidth: 1,
    gap: 6,
    padding: 12
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between'
  },
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  selectionTag: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase'
  },
  copy: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 18
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17
  },
  support: {
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 16
  }
});
