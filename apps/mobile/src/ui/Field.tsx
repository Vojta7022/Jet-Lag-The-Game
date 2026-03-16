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
    gap: 8
  },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
    textTransform: 'uppercase'
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderRadius: 16,
    borderWidth: 1,
    color: colors.text,
    minHeight: 50,
    paddingHorizontal: 16,
    paddingVertical: 12
  },
  inputMultiline: {
    minHeight: 112,
    textAlignVertical: 'top'
  }
});
