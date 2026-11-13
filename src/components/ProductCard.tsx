import React from 'react';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppCard } from './ui';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
export type ProductCardProps = {
  icon: IconName; category: string; name: string; price: string; seller: string;
  sellerId?: string; onSellerPress?: (sellerId: string) => void;
  coinPrice?: string; acceptanceLabel?: string; acceptanceGemn?: boolean; emphasizeName?: boolean; nameTestID?: string;
  rating?: string; imageUrl?: string; showCategory?: boolean; onPress: () => void;
  layout?: 'default' | 'marketplace' | 'home' | 'homeCompact' | 'marketplaceList' | 'marketplaceShowcase';
};

export function ProductCard({ icon, category, name, price, seller, sellerId, onSellerPress, coinPrice, acceptanceLabel, acceptanceGemn = false, emphasizeName = false, nameTestID, rating, imageUrl, showCategory = false, onPress, layout: cardLayout = 'default' }: ProductCardProps) {
  const compact = useWindowDimensions().width < layout.breakpoints.tablet;
  const marketplace = cardLayout === 'marketplace';
  const home = cardLayout === 'home';
  const homeCompact = cardLayout === 'homeCompact';
  const marketplaceList = cardLayout === 'marketplaceList';
  const marketplaceShowcase = cardLayout === 'marketplaceShowcase';
  const compactCard = compact && !marketplace && !marketplaceShowcase && !home && !homeCompact && !marketplaceList;
  const [imageFailed, setImageFailed] = React.useState(false);
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${name}, ${price}`} onPress={onPress} style={({ pressed }) => [styles.pressable, compact && !marketplace && !marketplaceShowcase && !homeCompact && styles.pressableCompact, pressed && styles.pressed]}>
      <AppCard padding={0} style={[styles.card, compactCard && styles.cardCompact, marketplace && styles.marketplaceCard, marketplaceShowcase && styles.marketplaceShowcaseCard, home && styles.homeCard, homeCompact && styles.homeCompactCard, marketplaceList && styles.marketplaceListCard, compact && marketplace && styles.marketplaceCardCompact]}>
        <View style={[!marketplace && !marketplaceShowcase && !home && !homeCompact && !marketplaceList && styles.visual, compactCard && styles.visualCompact, marketplace && styles.marketplaceVisual, marketplaceShowcase && styles.marketplaceShowcaseVisual, home && styles.homeVisual, homeCompact && styles.homeCompactVisual, marketplaceList && styles.marketplaceListVisual]}>
          {imageUrl && !imageFailed ? <Image source={{ uri: imageUrl }} style={styles.image} onError={() => setImageFailed(true)} /> : <View style={[styles.iconDisc, compactCard && styles.iconDiscCompact, marketplace && styles.marketplaceIconDisc, marketplaceShowcase && styles.marketplaceShowcaseIconDisc, home && styles.homeIconDisc, homeCompact && styles.homeCompactIconDisc, marketplaceList && styles.marketplaceListIconDisc]}><MaterialCommunityIcons name={icon} size={compact || marketplace || marketplaceShowcase || home || homeCompact || marketplaceList ? 30 : 38} color={colors.primary} /></View>}
          {(!compact || marketplace || showCategory) && !marketplaceList && !marketplaceShowcase && !homeCompact ? <View style={[styles.category, compact && marketplace && styles.categoryCompact]}><AppBadge label={category} /></View> : null}
        </View>
        <View style={[styles.info, compactCard && styles.infoCompact, marketplace && styles.marketplaceInfo, marketplaceShowcase && styles.marketplaceShowcaseInfo, home && styles.homeInfo, homeCompact && styles.homeCompactInfo, marketplaceList && styles.marketplaceListInfo, compact && marketplace && styles.marketplaceInfoCompact]}>
          <Text testID={nameTestID} accessibilityRole="text" style={[styles.name, compactCard && styles.nameCompact, marketplace && styles.marketplaceName, marketplaceShowcase && styles.marketplaceShowcaseName, home && styles.homeName, homeCompact && styles.homeCompactName, marketplaceList && styles.marketplaceListName, compact && marketplace && styles.marketplaceNameCompact, emphasizeName && styles.emphasizedName]} numberOfLines={marketplace || marketplaceShowcase || home || homeCompact || marketplaceList ? 2 : compact ? 1 : 2}>{name}</Text>
          {!marketplaceShowcase && !homeCompact && seller ? (sellerId && onSellerPress ? <Pressable accessibilityRole="button" accessibilityLabel={`Abrir vitrine de ${seller}`} onPress={(event) => { event.stopPropagation(); onSellerPress(sellerId); }} style={({ pressed }) => [styles.sellerRow, marketplaceList && styles.marketplaceListSellerRow, pressed && styles.sellerPressed]}><MaterialCommunityIcons name="store-outline" size={compact ? 13 : 14} color={colors.brandDark} /><Text style={[styles.seller, compact && styles.sellerCompact]} numberOfLines={2}>{seller}</Text></Pressable> : <View style={[styles.sellerRow, marketplaceList && styles.marketplaceListSellerRow]}><MaterialCommunityIcons name="store-outline" size={compact ? 13 : 14} color={colors.brandDark} /><Text style={[styles.seller, compact && styles.sellerCompact]} numberOfLines={2}>{seller}</Text></View>) : null}
          <View style={[styles.bottomRow, compactCard && styles.bottomRowCompact, marketplace && styles.marketplaceBottomRow, marketplaceShowcase && styles.marketplaceShowcaseBottomRow, home && styles.homeBottomRow, homeCompact && styles.homeCompactBottomRow, marketplaceList && styles.marketplaceListBottomRow, compact && marketplace && styles.marketplaceBottomRowCompact]}>
            <View style={styles.priceBlock}><Text style={[styles.price, compact && styles.priceCompact, compact && marketplace && styles.marketplacePriceCompact, marketplaceShowcase && styles.marketplaceShowcasePrice, home && styles.homePrice, homeCompact && styles.homeCompactPrice, marketplaceList && styles.marketplaceListPrice]}>{price}</Text>{coinPrice ? (compact && !marketplace && !marketplaceList ? <View style={styles.gemnBadge}><MaterialCommunityIcons name="star-four-points" size={11} color={colors.gemn} /><Text style={styles.gemnText}>GEMN</Text></View> : <View style={[styles.coinRow, marketplaceList && styles.marketplaceListCoinRow]}><MaterialCommunityIcons name="star-four-points" size={12} color={colors.gemn} /><Text style={[styles.coin, marketplaceList && styles.marketplaceListCoin]}>{coinPrice}</Text></View>) : null}</View>
            {!compact && rating ? <View style={styles.rating}><MaterialCommunityIcons name="star" size={14} color={colors.secondary} /><Text style={styles.ratingText}>{rating}</Text></View> : null}
          </View>
          {(marketplaceShowcase || homeCompact) && seller ? (sellerId && onSellerPress ? <Pressable accessibilityRole="button" accessibilityLabel={`Abrir vitrine de ${seller}`} onPress={(event) => { event.stopPropagation(); onSellerPress(sellerId); }} style={({ pressed }) => [styles.sellerRow, marketplaceShowcase && styles.marketplaceShowcaseSellerRow, homeCompact && styles.homeCompactSellerRow, pressed && styles.sellerPressed]}><MaterialCommunityIcons name="store-outline" size={12} color={colors.textSecondary} /><Text style={homeCompact ? styles.homeCompactSeller : styles.marketplaceShowcaseSeller} numberOfLines={1}>{seller}</Text></Pressable> : <View style={[styles.sellerRow, marketplaceShowcase && styles.marketplaceShowcaseSellerRow, homeCompact && styles.homeCompactSellerRow]}><MaterialCommunityIcons name="store-outline" size={12} color={colors.textSecondary} /><Text style={homeCompact ? styles.homeCompactSeller : styles.marketplaceShowcaseSeller} numberOfLines={1}>{seller}</Text></View>) : null}
          {acceptanceLabel ? <Text style={[styles.acceptance, acceptanceGemn ? styles.acceptanceGemn : styles.acceptanceMuted]} numberOfLines={2}>{acceptanceLabel}</Text> : null}
        </View>
      </AppCard>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: { width: '100%' },
  pressableCompact: { minHeight: 112 },
  pressed: { opacity: 0.88 },
  card: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg },
  cardCompact: { flexDirection: 'row', minHeight: 112, height: 'auto', alignItems: 'stretch' },
  visual: { height: 142, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  visualCompact: { width: 96, minHeight: 110, height: 'auto', flexShrink: 0 },
  marketplaceCard: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, height: 'auto' },
  marketplaceCardCompact: { borderRadius: radius.md },
  marketplaceShowcaseCard: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  homeCard: { width: '100%', borderRadius: radius.md, alignSelf: 'flex-start' },
  homeCompactCard: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md },
  marketplaceListCard: { flexDirection: 'row', minHeight: 116, height: 'auto', borderRadius: radius.md },
  marketplaceVisual: { width: '100%', aspectRatio: 1, alignSelf: 'stretch', overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  marketplaceShowcaseVisual: { width: '100%', aspectRatio: 1, alignSelf: 'stretch', overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  homeVisual: { width: '100%', aspectRatio: 1.55, maxHeight: 210, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  homeCompactVisual: { width: '100%', aspectRatio: 1, alignSelf: 'stretch', overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  marketplaceListVisual: { width: 116, height: 116, flexShrink: 0, overflow: 'hidden', backgroundColor: colors.surfaceMuted },
  marketplaceIconDisc: { width: 62, height: 62 },
  marketplaceShowcaseIconDisc: { width: 48, height: 48 },
  homeIconDisc: { width: 54, height: 54 },
  homeCompactIconDisc: { width: 42, height: 42 },
  marketplaceListIconDisc: { width: 54, height: 54 },
  marketplaceInfo: { width: '100%', padding: spacing.md, minWidth: 0, minHeight: 120 },
  marketplaceInfoCompact: { padding: 10 },
  marketplaceShowcaseInfo: { width: '100%', padding: 8, minWidth: 0, minHeight: 80 },
  homeInfo: { flex: 0, flexGrow: 0, flexShrink: 0, width: '100%', paddingHorizontal: spacing.md, paddingVertical: spacing.smMd, minWidth: 0 },
  homeCompactInfo: { width: '100%', paddingHorizontal: 6, paddingVertical: 6, minWidth: 0, minHeight: 64 },
  marketplaceListInfo: { flex: 1, paddingHorizontal: spacing.smMd, paddingVertical: spacing.sm, minWidth: 0, justifyContent: 'center' },
  marketplaceName: { ...typography.heading4, color: colors.brandDark, fontWeight: '700', width: '100%', minHeight: 40, flexShrink: 0 },
  marketplaceNameCompact: { fontSize: 14, lineHeight: 18, minHeight: 36 },
  marketplaceShowcaseName: { ...typography.bodySmall, color: colors.text, fontSize: 13, lineHeight: 17, fontWeight: '600', minHeight: 34 },
  homeName: { ...typography.heading4, color: colors.text, fontSize: 14, lineHeight: 18, minHeight: 36 },
  homeCompactName: { ...typography.bodySmall, color: colors.text, fontSize: 12, lineHeight: 15, fontWeight: '600', minHeight: 30 },
  marketplaceListName: { ...typography.heading4, color: colors.text, fontSize: 15, lineHeight: 18, minHeight: 36 },
  emphasizedName: { ...typography.heading3, color: colors.brandDark, fontWeight: '700', width: '100%', minHeight: 48, flexShrink: 0 },
  marketplaceBottomRow: { marginTop: spacing.sm },
  marketplaceBottomRowCompact: { marginTop: 6 },
  marketplaceShowcaseBottomRow: { marginTop: 4 },
  homeBottomRow: { marginTop: spacing.xs },
  homeCompactBottomRow: { marginTop: 2 },
  marketplaceListBottomRow: { marginTop: spacing.xs },
  image: { width: '100%', height: '100%', resizeMode: 'cover' },
  iconDisc: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  iconDiscCompact: { width: 54, height: 54 },
  category: { position: 'absolute', left: spacing.sm, bottom: spacing.sm },
  categoryCompact: { left: 8, bottom: 8, transform: [{ scale: 0.88 }] },
  info: { padding: spacing.md, flex: 1 },
  infoCompact: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, justifyContent: 'center', minWidth: 0 },
  name: { ...typography.body, color: colors.brandDark, fontWeight: '600', minHeight: 42 },
  nameCompact: { ...typography.bodySmall, color: colors.text, fontWeight: '700', minHeight: 0 },
  sellerRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2, minWidth: 0 },
  marketplaceShowcaseSellerRow: { marginTop: 2, gap: 3 },
  homeCompactSellerRow: { marginTop: 2, gap: 3 },
  marketplaceShowcaseSeller: { ...typography.caption, color: colors.textSecondary, fontSize: 11, lineHeight: 15, flex: 1, minWidth: 0 },
  homeCompactSeller: { ...typography.caption, color: colors.textSecondary, fontSize: 10, lineHeight: 13, flex: 1, minWidth: 0 },
  marketplaceListSellerRow: { marginTop: spacing.xxs },
  sellerPressed: { opacity: 0.7 },
  seller: { ...typography.heading4, color: colors.brandDark, fontSize: 14, lineHeight: 18, fontWeight: '600', flex: 1, minWidth: 0 },
  sellerCompact: { fontSize: 14, lineHeight: 18 },
  bottomRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginTop: spacing.md, gap: spacing.xs },
  bottomRowCompact: { marginTop: spacing.sm, alignItems: 'center' },
  priceBlock: { flexShrink: 1 },
  price: { ...typography.heading3, color: colors.brandDark },
  priceCompact: { fontSize: 16, lineHeight: 22 },
  marketplacePriceCompact: { fontSize: 15, lineHeight: 20 },
  marketplaceShowcasePrice: { ...typography.heading4, color: colors.success, fontSize: 14, lineHeight: 19 },
  homePrice: { ...typography.heading4, color: colors.brandDark, fontSize: 15, lineHeight: 20 },
  homeCompactPrice: { ...typography.heading4, color: colors.brandDark, fontSize: 13, lineHeight: 17 },
  marketplaceListPrice: { ...typography.heading4, color: colors.brandDark, fontSize: 15, lineHeight: 20 },
  gemnBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 3, marginTop: 2 },
  gemnText: { fontSize: 12, lineHeight: 16, fontWeight: '700', color: colors.gemn },
  coinRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: 3 },
  marketplaceListCoinRow: { alignSelf: 'flex-start', backgroundColor: colors.gemnLight, borderRadius: radius.full, paddingHorizontal: spacing.xs, paddingVertical: 2, marginTop: 2 },
  coin: { ...typography.caption, color: colors.gemn, fontWeight: '600' },
  marketplaceListCoin: { fontSize: 11, lineHeight: 14 },
  acceptance: { ...typography.caption, marginTop: spacing.sm, fontWeight: '600' },
  acceptanceGemn: { color: colors.brand },
  acceptanceMuted: { color: colors.textSecondary },
  rating: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ratingText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
});
