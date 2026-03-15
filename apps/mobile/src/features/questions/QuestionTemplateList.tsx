import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  QuestionCategoryDefinition,
  QuestionTemplateDefinition
} from '../../../../../packages/shared-types/src/index.ts';

import { colors } from '../../ui/theme.ts';

interface QuestionTemplateListProps {
  templates: QuestionTemplateDefinition[];
  category: QuestionCategoryDefinition;
  selectedTemplateId?: string;
  regionId?: string;
  describeSupport: (template: QuestionTemplateDefinition, category: QuestionCategoryDefinition) => string;
  onSelect: (templateId: string) => void;
}

export function QuestionTemplateList(props: QuestionTemplateListProps) {
  return (
    <View style={styles.list}>
      {props.templates.map((template) => {
        const selected = template.templateId === props.selectedTemplateId;
        const featureLabels = (template.featureClassRefs ?? []).map((feature) => feature.label).join(', ');

        return (
          <Pressable
            key={template.templateId}
            accessibilityRole="button"
            onPress={() => props.onSelect(template.templateId)}
            style={[styles.item, selected ? styles.itemSelected : null]}
          >
            <Text style={styles.title}>{template.name}</Text>
            {featureLabels ? <Text style={styles.copy}>Feature classes: {featureLabels}</Text> : null}
            <Text style={styles.copy}>Scale: {template.scaleSet.appliesTo.join(', ')}</Text>
            <Text style={styles.meta}>{props.describeSupport(template, props.category)}</Text>
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
  title: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  copy: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  meta: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700'
  }
});
