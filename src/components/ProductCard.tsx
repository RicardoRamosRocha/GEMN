import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppCard } from './ui';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type ProductCardProps = {
  icon: IconName; category: string; name: string; price: string; seller: string;
  coinPrice?: string; rating?: string; imageUrl?: string; onPress: () => void;
  layout?: 'default' | 'marketplace';
};

export function ProductCard({ icon, category, name, price, seller, coinPrice, rating, imageUrl, onPress, layout: cardLayout = 'default' }: ProductCardProps) {
  const compact = useWindowDimensions().width < layout.breakpoints.tablet;
  const marketplace = cardLayout === 'marketplace';
  const [imageFailed, setImageFailed] = React.useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${price}`} onPress={onPress} style={({ pressed }) => [styles.pressable, compact && !marketplace && styles.pressableCompact, pressed && styles.pressed]}>
      <AppCard padding={0} style={[styles.card, compact && !marketplace && styles.cardCompact, marketplace && styles.marketplaceCard]}>
        <View style={[styles.visual, compact && !marketplace && styles.visualCompact, marketplace && styles.marketplaceVisual]}>
          {imageUrl && !imageFailed ? <Image source={{ uri: imageUrl }} style={styles.image} onError={() => setImageFailed(true)} /> : <View style={[styles.iconDisc, compact && !marketplace && styles.iconDiscCompact, marketplace && styles.marketplaceIconDisc]}><MaterialCommunityIcons name={icon} size={compact || marketplace ? 30 : 38} color={colors.primary} /></View>}
          {!compact || marketplace ? <View style={styles.category}><AppBadge label={category} /></View> : null}
        </View>
        <View style={[styles.info, compact && !marketplace && styles.infoCompact, marketplace && styles.marketplaceInfo]}>
          <Text style={[styles.name, compact && !marketplace && styles.nameCompact, marketplace && styles.marketplaceName]} numberOfLines={marketplace ? 2 : compact ? 1 : 2}>{name}</Text>
          <View style={styles.sellerRow}><MaterialCommunityIcons name="store-outline" size={compact ? 12 : 14} color={colors.textSecondary} /><Text style={[styles.seller, compact && styles.sellerCompact]} numberOfLines={1}>{seller}</Text></View>
          <View style={[styles.bottomRow, compact && !marketplace && styles.bottomRowCompact, marketplace && styles.marketplaceBottomRow]}>
            <View style={styles.priceBlock}><Text style={[styles.price, compact && styles.priceCompact]}>{price}</Text>{coinPrice ? (compact ? <View style={styles.gemnBadge}><MaterialCommunityIcons name="star-four-points" size={11} color="#886512" /><Text style={styles.gemnText}>GEMN</Text></View> : <View style={styles.coinRow}><MaterialCommunityIcons name="star-four-points" size={12} color="#886512" /><Text style={styles.coin}>{coinPrice}</Text></View>) : null}</View>
            {!compact && rating ? <View style={styles.rating}><MaterialCommunityIcons name="star" size={14} color={colors.secondary} /><Text style={styles.ratingText}>{rating}</Text></View> : null}
          </View>
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  pressableCompact: { minHeight: 112 },
  pressed: { opacity: 0.88 },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, height: '100%' },
  cardCompact: { flexDirection: 'row', minHeight: 112, height: 'auto', alignItems: 'stretch' },
  visual: { height: 142, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  visualCompact: { width: 96, minHeight: 110, height: 'auto', flexShrink: 0 },
  marketplaceCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  marketplaceVisual: { aspectRatio: 1 },
  marketplaceIconDisc: { width: 62, height: 62 },
  marketplaceInfo: { padding: spacing.md, minWidth: 0, flex: 0, flexGrow: 0, flexShrink: 1 },
  marketplaceName: { ...typography.body, color: colors.text, fontWeight: '700', minHeight: 0 },
  marketplaceBottomRow: { marginTop: spacing.sm },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  iconDisc: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconDiscCompact: { width: 54, height: 54 },
  category: { position: 'absolute', left: spacing.sm, bottom: spacing.sm },
  info: { padding: spacing.md, flex: 1 },
  infoCompact: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center', minWidth: 0 },
  name: { ...typography.body, color: colors.text, fontWeight: '600', minHeight: 42 },
  nameCompact: { ...typography.bodySmall, color: colors.text, fontWeight: '700', minHeight: 0 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  seller: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  sellerCompact: { fontSize: 12 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.xs },
  bottomRowCompact: { marginTop: spacing.sm, alignItems: 'center' },
  priceBlock: { flexShrink: 1 },
  price: { ...typography.heading3, color: colors.text },
  priceCompact: { fontSize: 16, lineHeight: 22 },
  gemnBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, marginTop: 2 },
  gemnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: '#886512' },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  coin: { ...typography.caption, color: '#886512', fontWeight: '600' },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});
