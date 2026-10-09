import React from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type AppInputProps = Omit<TextInputProps, 'style'> & {
  label?: string;
  helperText?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  inputStyle?: TextInputProps['style'];
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
};

export function AppInput({ label, helperText, error, multiline = false, containerStyle, inputStyle, icon, ...inputProps }: AppInputProps) {
  const invalid = Boolean(error);
  return (
    <View style={containerStyle}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={[styles.inputWrap, invalid && styles.invalid]}>
        {icon ? <MaterialCommunityIcons name={icon} size={19} color={colors.textSecondary} style={styles.icon} /> : null}
        <TextInput
          {...inputProps}
          multiline={multiline}
          accessibilityHint={invalid ? error : helperText}
          placeholderTextColor={colors.textMuted}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.input, multiline && styles.multiline, inputStyle]}
        />
      </View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : helperText ? <Text style={styles.helper}>{helperText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...typography.label, color: colors.text, marginBottom: spacing.sm },
  inputWrap: { minHeight: 52, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.surfaceMuted, borderRadius: radius.md },
  input: { flex: 1, minHeight: 50, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, color: colors.text, backgroundColor: 'transparent', ...typography.body },
  icon: { marginLeft: spacing.md },
  multiline: { minHeight: 112, paddingTop: spacing.md },
  invalid: { borderColor: colors.error },
  helper: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
});
