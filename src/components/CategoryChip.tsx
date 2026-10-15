import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const tones = [colors.brandLight, colors.gemnLight, colors.surfaceMuted, colors.background] as const;

export function CategoryChip({ icon, label, compact = false, onPress, selected = false, tone = 0, variant = 'default' }: { icon: IconName; label: string; compact?: boolean; onPress?: () => void; selected?: boolean; tone?: number; variant?: 'default' | 'home' }) {
  const home = variant === 'home';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} accessibilityState={{ selected }} style={[styles.chip, home && styles.homeChip, compact && styles.compact, !selected && !compact && !home && { backgroundColor: tones[tone % tones.length] }, selected && (compact ? styles.selectedCompact : styles.selected)]}>
      <View style={[styles.iconWrap, home && styles.homeIcon, compact && styles.compactIcon, !selected && !compact && !home && { backgroundColor: colors.white }, selected && compact && styles.selectedCompactIcon]}><MaterialCommunityIcons name={icon} size={home ? 24 : compact ? 18 : 20} color={selected && compact ? colors.white : home ? colors.textSecondary : colors.primary} /></View>
      <Text style={[styles.label, home && styles.homeLabel, selected && compact && styles.selectedCompactLabel]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 96, minHeight: 84, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  homeChip: { minWidth: 58, minHeight: 76, paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: 'transparent', gap: spacing.sm },
  compact: { minWidth: 0, minHeight: 44, flexDirection: 'row', paddingHorizontal: spacing.md, borderRadius: radius.full, gap: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  iconWrap: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  homeIcon: { width: 58, height: 58, backgroundColor: colors.surfaceMuted },
  compactIcon: { width: 22, height: 22, borderRadius: radius.full },
  label: { ...typography.caption, color: colors.text, fontWeight: '600' },
  homeLabel: { ...typography.bodySmall, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center' },
  selected: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  selectedCompact: { borderWidth: 1, borderColor: colors.brandDark, backgroundColor: colors.brandDark },
  selectedCompactIcon: { backgroundColor: colors.brandOverlay },
  selectedCompactLabel: { color: colors.white },
});
