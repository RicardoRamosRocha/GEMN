import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const tones = [colors.brandLight, colors.gemnLight, colors.surfaceMuted, colors.background] as const;

export function CategoryChip({ icon, label, compact = false, onPress, selected = false, tone = 0, variant = 'default', hideIcon = false }: { icon: IconName; label: string; compact?: boolean; onPress?: () => void; selected?: boolean; tone?: number; variant?: 'default' | 'home' | 'marketplace'; hideIcon?: boolean }) {
  const home = variant === 'home';
  const marketplace = variant === 'marketplace';
  return (
    <Pressable accessibilityRole="button" onPress={onPress} accessibilityState={{ selected }} style={[styles.chip, home && styles.homeChip, marketplace && styles.marketplaceChip, compact && styles.compact, !selected && !compact && !home && !marketplace && { backgroundColor: tones[tone % tones.length] }, selected && (compact ? styles.selectedCompact : styles.selected)]}>
      {!hideIcon ? <View style={[styles.iconWrap, home && styles.homeIcon, marketplace && styles.marketplaceIcon, compact && styles.compactIcon, !selected && !compact && !home && !marketplace && { backgroundColor: colors.white }, selected && compact && styles.selectedCompactIcon, marketplace && selected && styles.marketplaceSelectedIcon]}><MaterialCommunityIcons name={icon} size={home ? 24 : compact ? 18 : 20} color={marketplace && selected ? colors.white : home || compact ? colors.brandDark : colors.primary} /></View> : null}
      <Text style={[styles.label, home && styles.homeLabel, marketplace && styles.marketplaceLabel, selected && compact && styles.selectedCompactLabel]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minWidth: 96, minHeight: 84, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  homeChip: { minWidth: 58, minHeight: 76, paddingHorizontal: spacing.xxs, paddingVertical: spacing.xs, borderRadius: radius.md, backgroundColor: 'transparent', gap: spacing.sm },
  marketplaceChip: { backgroundColor: colors.brandLight, borderColor: colors.brandLight },
  compact: { minWidth: 0, minHeight: 44, flexDirection: 'row', paddingHorizontal: spacing.md, borderRadius: radius.full, gap: spacing.sm, borderWidth: 1, borderColor: 'transparent' },
  iconWrap: { width: 36, height: 36, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  homeIcon: { width: 58, height: 58, backgroundColor: colors.brandLight },
  marketplaceIcon: { backgroundColor: colors.brandLight },
  compactIcon: { width: 22, height: 22, borderRadius: radius.full },
  label: { ...typography.caption, color: colors.text, fontWeight: '600' },
  homeLabel: { ...typography.bodySmall, color: colors.text, fontSize: 12, lineHeight: 16, fontWeight: '400', textAlign: 'center' },
  marketplaceLabel: { color: colors.brandDark },
  selected: { borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.primaryLight },
  selectedCompact: { borderWidth: 1, borderColor: colors.brandDark, backgroundColor: colors.brandDark },
  selectedCompactIcon: { backgroundColor: colors.brandLight },
  marketplaceSelectedIcon: { backgroundColor: colors.brandOverlay },
  selectedCompactLabel: { color: colors.white },
});
