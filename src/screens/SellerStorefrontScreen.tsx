import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { ProductCard } from '../components/ProductCard';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { sellerStorefrontUiFixtures, type SellerStorefrontFixtureScenario } from '../dev/sellerStorefrontUiFixtures';
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
  const acceptsGemn = sellerAcceptsGemn && listing.acceptsGemn;
  return {
    id: listing.id,
    sellerId: listing.sellerId,
    type: listing.type,
    name: listing.name,
    description: listing.description,
    category: listing.category,
    categoryId: listing.categoryId,
    price: listing.price,
    acceptsGemn,
    ...(acceptsGemn && listing.gemnValue !== undefined ? { gemnValue: listing.gemnValue } : {}),
    active: true,
    status: 'ativo',
    sellerName,
    imageUrl: listing.imageUrl,
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

      <AppCard elevated={desktop} style={[styles.hero, desktop && styles.heroWide]}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="storefront-outline" size={34} color={colors.primary} /></View>
        <View style={styles.heroCopy}><View style={styles.heroTitleRow}><Text style={styles.storeName}>{seller.nomeNegocio}</Text><AppBadge label="Vendedor ativo" variant="success" /></View><Text style={styles.description}>{seller.descricao}</Text><View style={styles.commerceRow}><AppBadge label={seller.aceitaGemn ? 'Aceita GEMN' : 'Pagamento em reais'} variant={seller.aceitaGemn ? 'gemn' : 'neutral'} /><Text style={styles.commerceHint}>{seller.aceitaGemn ? 'A aceitação também depende de cada anúncio.' : 'Esta loja não aceita GEMN globalmente.'}</Text></View></View>
      </AppCard>

      <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>Produtos e serviços</Text><Text style={styles.sectionSubtitle}>{listings.length === 0 ? 'Nenhum anúncio publicado no momento.' : `${listings.length} anúncio${listings.length === 1 ? '' : 's'} publicado${listings.length === 1 ? '' : 's'}`}</Text></View></View>

      {listings.length === 0 ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>Vitrine em preparação</Text><Text style={styles.emptyText}>Este vendedor ainda não publicou produtos ou serviços.</Text></AppCard> : <View style={[styles.catalog, desktop && styles.catalogWide]}>{listings.map((listing) => { const acceptsGemn = seller.aceitaGemn && listing.acceptsGemn; const product = listingAsProduct(listing, seller.nomeNegocio, seller.aceitaGemn); const acceptanceLabel = acceptsGemn ? 'Aceita GEMN neste anúncio' : listing.acceptsGemn && !seller.aceitaGemn ? 'GEMN indisponível no momento' : 'Pagamento somente em reais'; return <View key={listing.id} style={[styles.catalogItem, desktop && styles.catalogItemWide]}><ProductCard layout="marketplace" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} nameTestID={`seller-storefront-listing-name-${listing.id}`} price={product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} coinPrice={acceptsGemn && listing.gemnValue !== undefined ? `${listing.gemnValue.toLocaleString('pt-BR')} GEMN` : undefined} acceptanceLabel={acceptanceLabel} acceptanceGemn={acceptsGemn} emphasizeName seller={seller.nomeNegocio} onPress={() => navigation.navigate('Product', { listing: product })} /></View>; })}</View>}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoText: { ...typography.caption, color: colors.warning, flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, maxWidth: 1120, width: '100%', alignSelf: 'center', borderWidth: 1, borderColor: colors.border },
  heroWide: { padding: spacing.xl },
  heroIcon: { width: 68, height: 68, borderRadius: radius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  heroCopy: { flex: 1, gap: spacing.sm },
  heroTitleRow: { gap: spacing.sm },
  storeName: { ...typography.heading1, color: colors.text },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  commerceRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  commerceHint: { ...typography.caption, color: colors.textSecondary },
  sectionHeader: { maxWidth: 1120, width: '100%', alignSelf: 'center', gap: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary },
  catalog: { gap: spacing.md, maxWidth: 1120, width: '100%', alignSelf: 'center' },
  catalogWide: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  catalogItem: { width: '100%' },
  catalogItemWide: { width: '31.8%' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center', paddingVertical: spacing.xl, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.heading3, color: colors.text },
  emptyText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  feedbackState: { alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
});
