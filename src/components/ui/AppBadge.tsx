import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type AppBadgeVariant = 'neutral' | 'success' | 'warning' | 'gemn';
export type AppBadgeProps = { label: string; variant?: AppBadgeVariant };

export function AppBadge({ label, variant = 'neutral' }: AppBadgeProps) {
  return <View style={[styles.badge, styles[variant]]}><Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', minHeight: 28, paddingHorizontal: spacing.sm, borderRadius: radius.full, justifyContent: 'center' },
  label: { ...typography.caption, fontWeight: '600' },
  neutral: { backgroundColor: colors.surfaceMuted },
  neutralLabel: { color: colors.textSecondary },
  success: { backgroundColor: colors.primaryLight },
  successLabel: { color: colors.success },
  warning: { backgroundColor: '#FBF1DF' },
  warningLabel: { color: colors.warning },
  gemn: { backgroundColor: colors.secondaryLight },
  gemnLabel: { color: '#886512' },
});
