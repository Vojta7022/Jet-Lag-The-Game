import { Pressable, StyleSheet, Text } from 'react-native';

import { colors } from './theme.ts';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'primary' | 'secondary' | 'danger' | 'ghost';
}

export function AppButton(props: AppButtonProps) {
  const toneStyle =
    props.tone === 'secondary'
      ? styles.secondary
      : props.tone === 'danger'
        ? styles.danger
        : props.tone === 'ghost'
          ? styles.ghost
          : styles.primary;
  const labelStyle =
    props.tone === 'secondary'
      ? styles.secondaryLabel
      : props.tone === 'ghost'
        ? styles.ghostLabel
        : styles.label;

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
      <Text
        style={[
          labelStyle,
          !props.tone || props.tone === 'primary' ? styles.primaryLabel : null
        ]}
      >
        {props.label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12
  },
  primary: {
    backgroundColor: colors.signal,
    borderColor: colors.ink,
    borderBottomWidth: 4
  },
  secondary: {
    backgroundColor: colors.surfaceRaised,
    borderColor: colors.borderStrong,
    borderBottomWidth: 3
  },
  danger: {
    backgroundColor: colors.danger,
    borderColor: colors.danger
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: colors.borderStrong
  },
  disabled: {
    opacity: 0.55
  },
  pressed: {
    transform: [{ scale: 0.98 }, { translateY: 1 }]
  },
  label: {
    textAlign: 'center',
    color: colors.inkInverse,
    fontSize: 15,
    fontWeight: '700'
  },
  primaryLabel: {
    color: colors.ink,
    fontWeight: '800'
  },
  secondaryLabel: {
    textAlign: 'center',
    color: colors.text,
    fontSize: 15,
    fontWeight: '700'
  },
  ghostLabel: {
    textAlign: 'center',
    color: colors.accentStrong,
    fontSize: 14,
    fontWeight: '700'
  }
});
