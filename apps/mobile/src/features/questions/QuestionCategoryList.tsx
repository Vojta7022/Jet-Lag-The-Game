import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ScaleKey } from '../../../../../packages/shared-types/src/index.ts';
import type { QuestionCategoryViewModel } from './question-catalog.ts';
import { describeQuestionCategoryForPlayers } from './question-guidance.ts';
import {
  formatHiderCardReward,
  formatTimerPolicyLabel
} from './question-rule-model.ts';

import { colors, fonts } from '../../ui/theme.ts';
import { GameIcon } from '../../ui/GameIcon.tsx';

interface QuestionCategoryListProps {
  categories: QuestionCategoryViewModel[];
  selectedCategoryId?: string;
  selectedScale?: ScaleKey;
  disabledCategoryId?: string;
  onSelect: (categoryId: string) => void;
}

export function QuestionCategoryList(props: QuestionCategoryListProps) {
  return (
    <View style={styles.list}>
      {props.categories.map((entry, index) => {
        const selected = entry.category.categoryId === props.selectedCategoryId;
        const disabled = entry.category.categoryId === props.disabledCategoryId;
        return (
          <Pressable
            key={entry.category.categoryId}
            accessibilityRole="button"
            accessibilityState={{ selected, disabled }}
            disabled={disabled}
            onPress={() => props.onSelect(entry.category.categoryId)}
            style={[styles.item, selected ? styles.itemSelected : null, disabled ? styles.itemDisabled : null]}
          >
            <View style={styles.categoryHead}>
              <GameIcon name="questions" color={colors.accentStrong} />
              <Text style={styles.categoryNumber}>
                {String(index + 1).padStart(2, '0')} / CLUE FILE
              </Text>
            </View>
            <Text style={styles.title}>{entry.category.name}</Text>
            {disabled ? <Text style={styles.disabledBadge}>BLOCKED THIS ROLL</Text> : null}
            <Text style={styles.copy}>
              {describeQuestionCategoryForPlayers(entry.category)}
            </Text>
            <Text style={styles.rule}>
              Hider: {formatHiderCardReward(entry.category)} ·{' '}
              {formatTimerPolicyLabel(
                entry.category.defaultTimerPolicy,
                props.selectedScale
              )}
            </Text>
            <Text style={styles.meta}>
              {entry.templates.length}{' '}
              {entry.templates.length === 1 ? 'question' : 'questions'} ready in
              this clue group
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  categoryHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  categoryNumber: {
    fontFamily: fonts.mono,
    color: colors.accentStrong,
    fontSize: 9,
    letterSpacing: 1
  },
  list: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12
  },
  item: {
    backgroundColor: colors.surfaceRaised,
    flexBasis: 250,
    flexShrink: 1,
    flexGrow: 1,
    minHeight: 175,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
    padding: 20
  },
  itemSelected: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent,
    borderWidth: 2
  },
  itemDisabled: {
    opacity: 0.5
  },
  disabledBadge: {
    alignSelf: 'flex-start',
    color: colors.warning,
    fontFamily: fonts.mono,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.7
  },
  title: {
    color: colors.text,
    fontFamily: fonts.display,
    fontSize: 25,
    fontWeight: '700'
  },
  meta: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16
  },
  rule: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16
  },
  copy: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18
  }
});
