import { StyleSheet, Text, View } from 'react-native';

import { colors } from '../../ui/theme.ts';

export interface LiveMapInfoChipItem {
  label: string;
  value: string | number;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}

interface LiveMapInfoChipsProps {
  items: LiveMapInfoChipItem[];
}

export function LiveMapInfoChips(props: LiveMapInfoChipsProps) {
  if (props.items.length === 0) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      {props.items.map((item) => (
        <View
          key={`${item.label}:${String(item.value)}`}
          style={[
            styles.chip,
            item.tone === 'accent'
              ? styles.chipAccent
              : item.tone === 'success'
                ? styles.chipSuccess
                : item.tone === 'warning'
                  ? styles.chipWarning
                  : null
          ]}
        >
          <Text numberOfLines={1} style={styles.label}>
            {item.label}
          </Text>
          <Text numberOfLines={2} style={styles.value}>
            {String(item.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  chip: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    gap: 4,
    minWidth: 104,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  chipAccent: {
    backgroundColor: colors.accentMuted,
    borderColor: colors.accent
  },
  chipSuccess: {
    backgroundColor: colors.successMuted,
    borderColor: colors.success
  },
  chipWarning: {
    backgroundColor: colors.warningMuted,
    borderColor: colors.warning
  },
  label: {
    color: colors.textSubtle,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase'
  },
  value: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 16
  }
});
