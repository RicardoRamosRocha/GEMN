import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export type AdminScreenHeaderProps = {
  title: string;
  subtitle: string;
  onBack: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  refreshLabel?: string;
};

export function AdminScreenHeader({ title, subtitle, onBack, onRefresh, refreshing = false, refreshLabel = 'Atualizar' }: AdminScreenHeaderProps) {
  return <View style={styles.container}>
    <Pressable accessibilityRole="button" accessibilityLabel="Voltar ao painel administrativo" accessibilityHint="Retorna ao painel de administração" onPress={onBack} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} hitSlop={8}>
      <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
    </Pressable>
    <View style={styles.copy}>
      <Text style={styles.eyebrow}>Operação administrativa</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </View>
    {onRefresh ? <Pressable accessibilityRole="button" accessibilityLabel={refreshLabel} accessibilityState={{ busy: refreshing, disabled: refreshing }} onPress={onRefresh} disabled={refreshing} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]} hitSlop={8}>
      <MaterialCommunityIcons name="refresh" size={22} color={refreshing ? colors.textMuted : colors.primary} />
    </Pressable> : <View style={styles.iconButtonPlaceholder} />}
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
  copy: { flex: 1, minWidth: 0, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  iconButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconButtonPlaceholder: { width: 44, height: 44, flexShrink: 0 },
  pressed: { backgroundColor: colors.brandLight, opacity: 0.78 },
});
