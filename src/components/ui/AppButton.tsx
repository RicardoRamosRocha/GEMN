import React from 'react';
import { ActivityIndicator, Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type AppButtonVariant = 'primary' | 'secondary' | 'accent' | 'outline';
export type AppButtonProps = {
  title: string;
  onPress?: () => void;
  variant?: AppButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Keeps the button stretched on narrow layouts or inside a full-width action area. */
  fullWidth?: boolean;
  size?: 'regular' | 'compact';
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

export function AppButton({ title, onPress, variant = 'primary', disabled = false, loading = false, fullWidth = false, size = 'regular', style, accessibilityLabel }: AppButtonProps) {
  const unavailable = disabled || loading;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} accessibilityState={{ disabled: unavailable, busy: loading }} disabled={unavailable} onPress={onPress}
      style={({ pressed }) => [styles.button, styles[variant], size === 'compact' && styles.compact, fullWidth && styles.fullWidth, unavailable && styles.disabled, pressed && !unavailable && styles.pressed, style]}>
      {loading ? <ActivityIndicator size="small" color={variant === 'primary' || variant === 'accent' ? colors.white : colors.primary} /> : <Text style={[styles.label, styles[`${variant}Label`]]}>{title}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { alignSelf: 'flex-start', minHeight: 48, paddingHorizontal: spacing.lg, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  compact: { minHeight: 48, paddingHorizontal: spacing.md },
  fullWidth: { alignSelf: 'stretch', width: '100%' },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.secondaryLight },
  accent: { backgroundColor: colors.secondary },
  outline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.primary },
  label: { ...typography.label },
  primaryLabel: { color: colors.white },
  secondaryLabel: { color: colors.text },
  accentLabel: { color: colors.white },
  outlineLabel: { color: colors.primary },
  disabled: { opacity: 0.48 },
  pressed: { opacity: 0.82 },
});
