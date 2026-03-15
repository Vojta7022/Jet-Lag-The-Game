import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { QuestionCategoryViewModel } from './question-catalog.ts';
import { describeQuestionCategoryForPlayers } from './question-guidance.ts';

import { colors } from '../../ui/theme.ts';

interface QuestionCategoryListProps {
  categories: QuestionCategoryViewModel[];
  selectedCategoryId?: string;
  onSelect: (categoryId: string) => void;
}

export function QuestionCategoryList(props: QuestionCategoryListProps) {
  return (
    <View style={styles.list}>
      {props.categories.map((entry) => {
        const selected = entry.category.categoryId === props.selectedCategoryId;
        return (
          <Pressable
            key={entry.category.categoryId}
            accessibilityRole="button"
            onPress={() => props.onSelect(entry.category.categoryId)}
            style={[styles.item, selected ? styles.itemSelected : null]}
          >
            <Text style={styles.title}>{entry.category.name}</Text>
            <Text style={styles.copy}>{describeQuestionCategoryForPlayers(entry.category)}</Text>
            <Text style={styles.meta}>
              {entry.templates.length} {entry.templates.length === 1 ? 'question' : 'questions'} available
            </Text>
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
    gap: 4,
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
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
