import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const tones = ['#F1F5FF', '#FFF3EA', '#EFFBF7', '#FFF8E8'] as const;

export function CategoryChip({ icon, label, compact = false, onPress, selected = false, tone = 0 }: { icon: IconName; label: string; compact?: boolean; onPress?: () => void; selected?: boolean; tone?: number }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} accessibilityState={{ selected }} style={[styles.chip, compact && styles.compact, !selected && !compact && { backgroundColor: tones[tone % tones.length] }, selected && styles.selected]}>
      <View style={[styles.iconWrap, compact && styles.compactIcon, !selected && !compact && { backgroundColor: colors.white }]}><MaterialCommunityIcons name={icon} size={compact ? 18 : 20} color={colors.primary} /></View>
      <Text style={styles.label} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 96, minHeight: 84, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  compact: { minWidth: 0, minHeight: 42, flexDirection: 'row', paddingHorizontal: spacing.md, borderRadius: radius.full, gap: spacing.sm },
  iconWrap: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  compactIcon: { width: 22, height: 22, borderRadius: radius.full },
  label: { ...typography.caption, color: colors.text, fontWeight: '600' },
  selected: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
});
