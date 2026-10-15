import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppCard, AppScreen } from '../components/ui';
import { WalletCard } from '../components/WalletCard';
import { useProducts } from '../context/ProductsContext';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;
const communityAccent = '#16866A';
const premiumBlue = '#123B7A';
const blueAccent = '#1D56D8';
const lightBlue = '#D8E6FF';
const softGreen = '#A9DCD0';

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const homeHorizontalPadding = desktop ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const homeContentWidth = Math.min(width - homeHorizontalPadding * 2, layout.contentMaxWidth - homeHorizontalPadding * 2);
  const curatedCardWidth = Math.floor(homeContentWidth / (desktop ? 3.35 : 1.35));
  const { marketplaceProducts, marketplaceLoading, marketplaceError } = useProducts();
  const curatedProducts = marketplaceProducts.slice(0, 5);

  function openMarketplace() {
    navigation.navigate('Marketplace', { screen: 'MarketplaceHome' });
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} maxWidth={desktop ? 1180 : layout.contentMaxWidth} contentContainerStyle={[styles.content, desktop && styles.contentDesktop]}>
      <View style={styles.headerRow}>
        <View style={styles.brandBlock}>
          <Text style={styles.brand}>GEMN</Text>
          <Text style={styles.community}>Comunidade Mundo Novo</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" style={styles.profileButton} onPress={() => navigation.navigate('Perfil', { screen: 'ProfileHome' })}>
          <MaterialCommunityIcons name="account-outline" size={22} color={colors.primary} />
        </Pressable>
      </View>

      <AppCard padding={0} style={styles.introCard}>
        <View style={[styles.introTop, desktop && styles.introTopDesktop]}>
          <View style={styles.introCopy}>
          <Text style={styles.introKicker}>PERTENCER. CONECTAR. CRESCER.</Text>
            <Text style={[styles.introTitle, desktop && styles.introTitleDesktop]}>Negócios que aproximam pessoas.</Text>
            <Text style={styles.introBody}>Uma seleção especial de quem movimenta a nossa comunidade.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Explorar Marketplace" onPress={openMarketplace} style={styles.marketplaceLink}>
              <Text style={styles.marketplaceLinkText}>Explorar Marketplace</Text>
              <MaterialCommunityIcons name="arrow-up-right" size={17} color={premiumBlue} />
            </Pressable>
          </View>
          <View style={styles.connectionVisual}>
            <View style={styles.visualRing} />
            <View style={styles.visualRingSmall} />
            <MaterialCommunityIcons name="account-group-outline" size={42} color={softGreen} />
          </View>
        </View>
        <WalletCard embedded compact onPress={() => navigation.navigate('Perfil', { screen: 'Wallet' })} />
      </AppCard>

      <View style={styles.sectionHeaderRow}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionKicker}>CURADORIA GEMN</Text>
          <Text style={styles.sectionTitle}>Da nossa comunidade</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Conhecer mais anúncios" onPress={openMarketplace} style={styles.moreLink}>
          <Text style={styles.moreLinkText}>Conhecer mais</Text>
          <MaterialCommunityIcons name="arrow-right" size={16} color={communityAccent} />
        </Pressable>
      </View>

      {marketplaceLoading ? <AppCard style={styles.feedbackCard}><Text style={styles.helperText}>Carregando novidades...</Text></AppCard> : marketplaceError ? <AppCard style={styles.feedbackCard}><Text style={styles.errorText}>{marketplaceError}</Text></AppCard> : curatedProducts.length === 0 ? <AppCard style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={communityAccent} /><Text style={styles.emptyTitle}>A comunidade está preparando novidades</Text><Text style={styles.helperText}>Novos produtos e serviços aparecerão aqui.</Text></AppCard> : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.curatedList}>
          {curatedProducts.map((product, index) => <CuratedProductCard key={product.id} product={product} width={curatedCardWidth} onPress={() => navigation.navigate('Product', { listing: product, listingSequence: curatedProducts, listingIndex: index })} />)}
          <View style={styles.carouselEnd} accessibilityLabel="Mais produtos à direita"><MaterialCommunityIcons name="arrow-right" size={20} color={communityAccent} /></View>
        </ScrollView>
      )}

      <View style={styles.communityStatement}>
        <View style={styles.statementIcon}><MaterialCommunityIcons name="handshake-outline" size={20} color={communityAccent} /></View>
        <View style={styles.statementCopy}><Text style={styles.statementTitle}>Conexões que movimentam</Text><Text style={styles.statementBody}>Apoie empreendedores e fortaleça a rede local.</Text></View>
      </View>

      <View style={[styles.quickLinks, desktop && styles.quickLinksDesktop]}>
        <QuickLink icon="clipboard-text-outline" title="Meus pedidos" onPress={() => navigation.navigate('Perfil', { screen: 'Orders' })} />
        <QuickLink icon="account-circle-outline" title="Minha conta" onPress={() => navigation.navigate('Perfil', { screen: 'ProfileHome' })} />
      </View>
    </AppScreen>
  );
}

function CuratedProductCard({ product, width, onPress }: { product: any; width: number; onPress: () => void }) {
  const [imageFailed, setImageFailed] = React.useState(false);
  const eligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${product.name}, ${formatPrice(product.price)}`} onPress={onPress} style={({ pressed }) => [styles.curatedCard, { width }, pressed && styles.pressed]}>
      <View style={styles.curatedVisual}>
        {product.imageUrl && !imageFailed ? <Image source={{ uri: product.imageUrl }} style={styles.curatedImage} onError={() => setImageFailed(true)} /> : <View style={styles.curatedFallback}><MaterialCommunityIcons name={product.icon as IconName} size={34} color={communityAccent} /></View>}
        <View style={styles.curatedTag}><Text style={styles.curatedTagText}>{product.category}</Text></View>
      </View>
      <View style={styles.curatedInfo}>
        <Text style={styles.curatedName} numberOfLines={2}>{product.name}</Text>
        <Text style={styles.curatedSeller} numberOfLines={1}>{product.sellerName ?? 'Comunidade GEMN'}</Text>
        <View style={styles.curatedPriceRow}><Text style={styles.curatedPrice}>{formatPrice(product.price)}</Text>{eligibility.enabled ? <Text style={styles.curatedGemn}>{eligibility.value} GEMN</Text> : null}</View>
      </View>
    </Pressable>
  );
}

function QuickLink({ icon, title, onPress }: { icon: IconName; title: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.quickLink, pressed && styles.pressed]}><MaterialCommunityIcons name={icon} size={19} color={communityAccent} /><Text style={styles.quickLinkText}>{title}</Text><MaterialCommunityIcons name="arrow-up-right" size={16} color={colors.textMuted} /></Pressable>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  contentDesktop: { paddingTop: spacing.lg, gap: spacing.xl },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandBlock: { gap: 2 },
  brand: { ...typography.heading2, color: colors.primary, letterSpacing: 1.2 },
  community: { ...typography.caption, color: colors.textSecondary },
  profileButton: { width: 44, height: 44, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  introCard: { backgroundColor: premiumBlue, borderWidth: 1, borderColor: blueAccent, overflow: 'hidden' },
  introTop: { minHeight: 192, padding: spacing.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  introTopDesktop: { minHeight: 210, paddingHorizontal: spacing.xl },
  introCopy: { flex: 1, maxWidth: 620, gap: spacing.xs },
  introKicker: { ...typography.label, color: softGreen, letterSpacing: 1 },
  introTitle: { ...typography.heading1, color: colors.white, maxWidth: 520 },
  introTitleDesktop: { fontSize: 34, lineHeight: 42 },
  introBody: { ...typography.bodySmall, color: lightBlue, maxWidth: 430 },
  marketplaceLink: { alignSelf: 'flex-start', minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: softGreen },
  marketplaceLinkText: { ...typography.caption, color: premiumBlue, fontWeight: '700' },
  connectionVisual: { width: 104, height: 104, borderRadius: radius.full, backgroundColor: blueAccent, alignItems: 'center', justifyContent: 'center', position: 'relative' },
  visualRing: { position: 'absolute', width: 76, height: 76, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(169,220,208,0.34)' },
  visualRingSmall: { position: 'absolute', width: 52, height: 52, borderRadius: radius.full, borderWidth: 1, borderColor: 'rgba(169,220,208,0.22)' },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.md },
  sectionHeader: { gap: spacing.xs },
  sectionKicker: { ...typography.label, color: communityAccent, letterSpacing: 0.9 },
  sectionTitle: { ...typography.heading2, color: colors.primary },
  moreLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingBottom: spacing.xs },
  moreLinkText: { ...typography.caption, color: communityAccent, fontWeight: '700' },
  curatedList: { gap: spacing.md, paddingRight: spacing.md },
  carouselEnd: { width: 34, minHeight: 46, alignSelf: 'center', borderRadius: radius.full, backgroundColor: '#E5EFE8', alignItems: 'center', justifyContent: 'center' },
  curatedCard: { width: 232, backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  curatedVisual: { width: '100%', height: undefined, aspectRatio: 1, backgroundColor: '#EEF2EE', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' },
  curatedImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  curatedFallback: { width: 64, height: 64, borderRadius: radius.full, backgroundColor: '#E1EEE6', alignItems: 'center', justifyContent: 'center' },
  curatedTag: { position: 'absolute', left: spacing.sm, bottom: spacing.sm, paddingHorizontal: spacing.sm, minHeight: 25, borderRadius: radius.full, backgroundColor: 'rgba(255,255,255,0.92)', justifyContent: 'center' },
  curatedTagText: { ...typography.caption, color: communityAccent, fontWeight: '600' },
  curatedInfo: { padding: spacing.md, gap: spacing.xs },
  curatedName: { ...typography.heading4, color: colors.primary, minHeight: 40 },
  curatedSeller: { ...typography.caption, color: colors.textSecondary },
  curatedPriceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.xs, marginTop: spacing.sm },
  curatedPrice: { ...typography.heading3, color: colors.primary },
  curatedGemn: { ...typography.caption, color: '#886512', fontWeight: '700' },
  communityStatement: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  statementIcon: { width: 38, height: 38, borderRadius: radius.full, backgroundColor: '#E5EFE8', alignItems: 'center', justifyContent: 'center' },
  statementCopy: { flex: 1, gap: 2 },
  statementTitle: { ...typography.label, color: colors.primary },
  statementBody: { ...typography.caption, color: colors.textSecondary },
  quickLinks: { flexDirection: 'row', gap: spacing.sm },
  quickLinksDesktop: { maxWidth: 520 },
  quickLink: { flex: 1, minHeight: 48, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  quickLinkText: { ...typography.caption, color: colors.primary, fontWeight: '700', flex: 1 },
  feedbackCard: { minHeight: 92, justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  emptyCard: { minHeight: 150, alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  emptyTitle: { ...typography.heading4, color: colors.primary, textAlign: 'center' },
  helperText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
