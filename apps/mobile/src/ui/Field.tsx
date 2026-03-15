import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors } from './theme.ts';

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: 'none' | 'words' | 'sentences' | 'characters';
  multiline?: boolean;
  numberOfLines?: number;
}

export function Field(props: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        autoCapitalize={props.autoCapitalize ?? 'none'}
        multiline={props.multiline}
        onChangeText={props.onChangeText}
        numberOfLines={props.numberOfLines}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, props.multiline ? styles.inputMultiline : null]}
        value={props.value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    gap: 6
  },
  label: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600'
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    color: colors.text,
    minHeight: 46,
    paddingHorizontal: 14,
    paddingVertical: 10
  },
  inputMultiline: {
    minHeight: 104,
    textAlignVertical: 'top'
  }
});
