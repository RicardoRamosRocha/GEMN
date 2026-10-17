import React from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { HorizontalProductCarousel } from '../components/HorizontalProductCarousel';
import { ProductCard } from '../components/ProductCard';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { sellerStorefrontUiFixtures, type SellerStorefrontFixtureScenario } from '../dev/sellerStorefrontUiFixtures';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { getSellerStorefront, SellerStorefrontServiceError } from '../services/sellerStorefront';
import type { SellerStorefront, SellerStorefrontListing } from '../types/sellerStorefront';
import type { GemnProduct } from '../context/ProductsContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type StorefrontScreenProps = {
  route?: { params?: { sellerId?: string } };
  navigation: any;
};

function fixtureScenario(): SellerStorefrontFixtureScenario {
  const value = process.env.EXPO_PUBLIC_GEMN_STOREFRONT_FIXTURE;
  return value === 'empty' || value === 'suspended' || value === 'error' ? value : 'active';
}

function fixtureStorefront(scenario: SellerStorefrontFixtureScenario): SellerStorefront {
  if (scenario === 'error') throw new SellerStorefrontServiceError('network', 'Falha simulada ao carregar a vitrine.', undefined, true);
  const fixture = sellerStorefrontUiFixtures[scenario];
  if (fixture.seller.status !== 'ativo') throw new SellerStorefrontServiceError('unavailable', 'Esta vitrine não está disponível.');
  return {
    seller: { ...fixture.seller, status: 'ativo' },
    listings: fixture.listings,
  };
}

function errorMessage(error: unknown) {
  if (error instanceof SellerStorefrontServiceError) return error.message;
  return 'Não foi possível carregar a vitrine. Tente novamente.';
}

function listingAsProduct(listing: SellerStorefrontListing, sellerName: string, sellerAcceptsGemn: boolean): GemnProduct {
  const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn, listingAcceptsGemn: listing.acceptsGemn, gemnValue: listing.gemnValue });
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    type: listing.type,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    categoryId: listing.categoryId,
    price: listing.price,
    acceptsGemn: gemnEligibility.enabled,
    sellerAcceptsGemn,
    ...(gemnEligibility.enabled && gemnEligibility.value !== undefined ? { gemnValue: gemnEligibility.value } : {}),
    active: true,
    status: 'ativo',
    sellerName,
    imageUrl: listing.imageUrl,
    images: listing.images,
    icon: listing.type === 'Produto' ? 'package-variant-closed' : 'tools',
  };
}

export default function SellerStorefrontScreen({ route, navigation }: StorefrontScreenProps) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const sellerId = route?.params?.sellerId;
  const fixturesEnabled = isGemnUiFixturesEnabled();
  const [storefront, setStorefront] = React.useState<SellerStorefront | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadStorefront = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!sellerId) throw new SellerStorefrontServiceError('validation', 'O vendedor desta vitrine não foi identificado.');
      const next = fixturesEnabled ? fixtureStorefront(fixtureScenario()) : await getSellerStorefront(sellerId);
      setStorefront(next);
    } catch (loadError) {
      setStorefront(null);
      setError(errorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [fixturesEnabled, sellerId]);

  React.useEffect(() => {
    void loadStorefront();
  }, [loadStorefront]);

  if (loading) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando vitrine...</Text></AppScreen>;
  }

  if (!storefront) {
    return <AppScreen contentContainerStyle={styles.feedbackState}><MaterialCommunityIcons name="store-off-outline" size={46} color={colors.textMuted} /><Text style={styles.feedbackTitle}>Vitrine indisponível</Text><Text accessibilityRole="alert" style={styles.feedbackText}>{error}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadStorefront(); }} /></AppScreen>;
  }

  const { seller, listings } = storefront;
  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      {fixturesEnabled ? <View style={styles.demoBanner}><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoText}>Modo de demonstração — dados locais sintéticos</Text></View> : null}

      <View style={[styles.hero, desktop && styles.heroWide]}>
        {seller.bannerUrl ? <Image accessibilityLabel="Imagem de capa da loja" source={{ uri: seller.bannerUrl }} resizeMode="cover" style={styles.banner} /> : <View accessibilityLabel="Capa visual da loja" style={styles.bannerFallback}><View style={styles.fallbackOrbLarge} /><View style={styles.fallbackOrbSmall} /></View>}

        <View style={[styles.identity, desktop && styles.identityWide]}>
          <View style={styles.logoFrame}>
            {seller.logoUrl ? <Image accessibilityLabel="Logotipo da loja" source={{ uri: seller.logoUrl }} resizeMode="contain" style={styles.logo} /> : <View style={styles.logoPlaceholder}><MaterialCommunityIcons name="storefront-outline" size={38} color={colors.primary} /></View>}
          </View>
          <View style={styles.identityCopy}>
            <View style={styles.identityTitleRow}><Text style={styles.storeName}>{seller.nomeNegocio}</Text><AppBadge label="Vendedor aprovado" variant="success" /></View>
          </View>
        </View>

        <View style={styles.heroFooter}>
          <View style={styles.commerceRow}><AppBadge label={seller.aceitaGemn ? 'Aceita GEMN' : 'Pagamento em reais'} variant={seller.aceitaGemn ? 'gemn' : 'neutral'} /><Text style={styles.commerceHint}>{seller.aceitaGemn ? 'A aceitação também depende de cada anúncio.' : 'Esta loja não aceita GEMN globalmente.'}</Text></View>
        </View>
      </View>

      <AppCard style={styles.aboutCard}>
        <View style={styles.aboutHeading}><View style={styles.aboutIcon}><MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} /></View><Text style={styles.sectionTitle}>Sobre a empresa</Text></View>
        <Text style={styles.aboutText}>{seller.descricao}</Text>
      </AppCard>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Produtos e serviços</Text><Text style={styles.sectionSubtitle}>{listings.length === 0 ? 'Nenhum anúncio publicado no momento.' : `${listings.length} anúncio${listings.length === 1 ? '' : 's'} publicado${listings.length === 1 ? '' : 's'}`}</Text></View></View>

      {listings.length === 0 ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>Vitrine em preparação</Text><Text style={styles.emptyText}>Este vendedor ainda não publicou produtos ou serviços.</Text></AppCard> : <HorizontalProductCarousel products={listings.map((listing) => listingAsProduct(listing, seller.nomeNegocio, seller.aceitaGemn))} renderItem={(product) => { const listing = listings.find((item) => item.id === product.id); const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: seller.aceitaGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue }); const acceptanceLabel = gemnEligibility.enabled ? 'Aceita GEMN neste anúncio' : listing?.acceptsGemn && !seller.aceitaGemn ? 'GEMN indisponível no momento' : 'Pagamento somente em reais'; return <ProductCard layout="home" icon={product.icon} imageUrl={product.imageUrl} category={product.category} showCategory name={product.name} nameTestID={`seller-storefront-listing-name-${product.id}`} price={product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} coinPrice={gemnEligibility.enabled && gemnEligibility.value !== undefined ? `${gemnEligibility.value.toLocaleString('pt-BR')} GEMN` : undefined} acceptanceLabel={acceptanceLabel} acceptanceGemn={gemnEligibility.enabled} seller={seller.nomeNegocio} onPress={() => navigation.navigate('Product', { listing: product })} />; }} />}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoText: { ...typography.caption, color: colors.warning, flex: 1 },
  hero: { width: '100%', maxWidth: layout.contentMaxWidth, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  heroWide: { ...({ boxShadow: '0px 8px 24px rgba(17, 24, 39, 0.08)' } as object) },
  banner: { width: '100%', aspectRatio: 16 / 5, minHeight: 128, maxHeight: 350 },
  bannerFallback: { width: '100%', aspectRatio: 16 / 5, minHeight: 128, maxHeight: 350, overflow: 'hidden', backgroundColor: colors.primary, position: 'relative' },
  fallbackOrbLarge: { position: 'absolute', width: 280, height: 280, borderRadius: 140, right: -72, top: -122, backgroundColor: colors.secondary, opacity: 0.85 },
  fallbackOrbSmall: { position: 'absolute', width: 180, height: 180, borderRadius: 90, left: -70, bottom: -110, backgroundColor: '#547EE0', opacity: 0.8 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm },
  identityWide: { paddingHorizontal: spacing.xl },
  logoFrame: { width: 76, height: 76, borderRadius: radius.lg, padding: spacing.xs, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, shadowColor: '#17251C', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 7, elevation: 3 },
  logo: { width: '100%', height: '100%', borderRadius: radius.lg, backgroundColor: colors.surfaceMuted },
  logoPlaceholder: { flex: 1, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  identityCopy: { flex: 1, minWidth: 0, gap: spacing.xs, paddingBottom: spacing.xs },
  identityTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  storeName: { ...typography.heading1, color: colors.text, flexShrink: 1 },
  heroFooter: { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  commerceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  commerceHint: { ...typography.caption, color: colors.textSecondary, flexShrink: 1 },
  aboutCard: { maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  aboutHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  aboutIcon: { width: 36, height: 36, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  aboutText: { ...typography.body, color: colors.textSecondary, lineHeight: 24 },
  sectionHeader: { maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center', gap: spacing.xs, paddingTop: spacing.sm },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  emptyCard: { alignItems: 'center', gap: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center', paddingVertical: spacing.xl, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 64, height: 64, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.heading3, color: colors.text },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  feedbackState: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
