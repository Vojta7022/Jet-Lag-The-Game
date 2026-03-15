import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from './theme.ts';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger';
}

export function AppButton(props: AppButtonProps) {
  const toneStyle =
    props.tone === 'secondary'
      ? styles.secondary
      : props.tone === 'danger'
        ? styles.danger
        : styles.primary;
  const labelStyle = props.tone === 'secondary' ? styles.secondaryLabel : styles.label;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.button,
        toneStyle,
        props.disabled && styles.disabled,
        pressed && !props.disabled ? styles.pressed : null
      ]}
    >
      <Text style={labelStyle}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  primary: {
    backgroundColor: colors.accent,
    borderColor: colors.accent
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    transform: [{ scale: 0.98 }]
  },
  label: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600'
  },
  secondaryLabel: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600'
  }
});
