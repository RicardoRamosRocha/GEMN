import React from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type AppInputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  helperText?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
};

export function AppInput({ label, helperText, error, multiline = false, containerStyle, inputStyle, ...inputProps }: AppInputProps) {
  const invalid = Boolean(error);
  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...inputProps}
        multiline={multiline}
        accessibilityHint={invalid ? error : helperText}
        placeholderTextColor={colors.textMuted}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.multiline, invalid && styles.invalid, inputStyle]}
      />
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  input: { minHeight: 48, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, ...typography.body },
  multiline: { minHeight: 112, paddingTop: spacing.md },
  invalid: { borderColor: colors.error },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
});
