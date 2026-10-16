import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppCard, AppScreen } from '../components/ui';
import { CategoryChip } from '../components/CategoryChip';
import { HorizontalProductCarousel } from '../components/HorizontalProductCarousel';
import { ProductCard } from '../components/ProductCard';
import { WalletCard } from '../components/WalletCard';
import { useProducts } from '../context/ProductsContext';
import type { GemnProduct } from '../context/ProductsContext';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type IconName = keyof typeof MaterialCommunityIcons.glyphMap;

const categoryIcons = ['food-apple-outline', 'tools', 'tshirt-crew-outline', 'home-outline', 'heart-outline'] as const;

function categoryIcon(name: string, index: number): IconName {
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes('aliment') || normalized.includes('comida') || normalized.includes('food')) return 'food-apple-outline';
  if (normalized.includes('serv') || normalized.includes('prof')) return 'tools';
  if (normalized.includes('roup') || normalized.includes('moda')) return 'tshirt-crew-outline';
  if (normalized.includes('casa') || normalized.includes('lar')) return 'home-outline';
  if (normalized.includes('saú') || normalized.includes('saud')) return 'heart-outline';
  return categoryIcons[index % categoryIcons.length];
}

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const { marketplaceProducts, marketplaceLoading, marketplaceError, categories, categoriesLoading, categoriesError } = useProducts();
  const spotlightProducts = marketplaceProducts.slice(0, 6);
  const visibleCategories = categories.slice(0, 5);

  function openMarketplace(params?: { category?: string; search?: string }) {
    navigation.navigate('Marketplace', { screen: 'MarketplaceHome', params });
  }

  function openProfile() {
    navigation.navigate('Perfil', { screen: 'ProfileHome' });
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} maxWidth={desktop ? 1180 : layout.contentMaxWidth} contentContainerStyle={styles.content}>
      <View style={[styles.greenHeader, desktop && styles.greenHeaderWide]}>
        <View style={styles.headerTop}>
          <Text style={styles.logo}>GEMN</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha conta" onPress={openProfile} style={({ pressed }) => [styles.profileButton, pressed && styles.pressed]}>
            <MaterialCommunityIcons name="account-outline" size={23} color={colors.white} />
          </Pressable>
        </View>
        <Pressable accessibilityRole="search" accessibilityLabel="Buscar produtos ou serviços" onPress={() => openMarketplace({ search: '' })} style={({ pressed }) => [styles.searchBar, pressed && styles.pressed]}>
          <MaterialCommunityIcons name="magnify" size={22} color={colors.brandDark} />
          <Text style={styles.searchPlaceholder}>Buscar produtos ou serviços...</Text>
        </Pressable>
      </View>

      <View style={styles.walletOverlap}>
        <WalletCard compact onPress={() => navigation.navigate('Perfil', { screen: 'Wallet' })} />
      </View>

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Categorias</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver todas as categorias" onPress={() => openMarketplace()} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Ver todas</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={colors.textSecondary} />
        </Pressable>
      </View>

      {categoriesLoading ? (
        <View style={styles.inlineFeedback}><ActivityIndicator color={colors.brand} /><Text style={styles.helperText}>Carregando categorias...</Text></View>
      ) : categoriesError ? (
        <AppCard style={styles.feedbackCard}><Text style={styles.errorText}>{categoriesError}</Text></AppCard>
      ) : visibleCategories.length === 0 ? (
        <AppCard style={styles.emptyCard}><Text style={styles.helperText}>As categorias da comunidade aparecerão aqui.</Text></AppCard>
      ) : (
        <View style={styles.categoriesRow}>
          {visibleCategories.map((category, index) => <CategoryChip key={category.id} variant="home" icon={categoryIcon(category.name, index)} label={category.name} onPress={() => openMarketplace({ category: category.name })} />)}
        </View>
      )}

      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionTitle}>Destaques</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Ver mais destaques" onPress={() => openMarketplace()} style={styles.seeAll}>
          <Text style={styles.seeAllText}>Ver todas</Text>
          <MaterialCommunityIcons name="chevron-right" size={17} color={colors.textSecondary} />
        </Pressable>
      </View>

      {marketplaceLoading ? <View style={styles.inlineFeedback}><ActivityIndicator color={colors.brand} /><Text style={styles.helperText}>Carregando destaques...</Text></View> : marketplaceError ? <AppCard style={styles.feedbackCard}><Text style={styles.errorText}>{marketplaceError}</Text></AppCard> : spotlightProducts.length === 0 ? <AppCard style={styles.emptyCard}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.brand} /><Text style={styles.emptyTitle}>Ainda não há destaques</Text><Text style={styles.helperText}>Novos produtos e serviços aparecerão aqui.</Text></AppCard> : (
        <HorizontalProductCarousel
          products={spotlightProducts}
          renderItem={(product, index) => <HomeProductCard product={product} onPress={() => navigation.navigate('Product', { listing: product, listingSequence: spotlightProducts, listingIndex: index })} onSellerPress={(sellerId) => navigation.navigate('SellerStorefront', { sellerId })} />}
        />
      )}

    </AppScreen>
  );
}

function HomeProductCard({ product, onPress, onSellerPress }: { product: GemnProduct; onPress: () => void; onSellerPress: (sellerId: string) => void }) {
  const eligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
  return <ProductCard layout="home" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={formatPrice(product.price)} seller={product.sellerName ?? ''} sellerId={product.sellerId} onSellerPress={onSellerPress} coinPrice={eligibility.enabled && eligibility.value !== undefined ? `${eligibility.value} GEMN` : undefined} acceptanceGemn={eligibility.enabled} onPress={onPress} />;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xl, gap: spacing.md },
  greenHeader: { minHeight: 168, paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.smMd, borderRadius: radius.xl, backgroundColor: colors.brandDark, gap: spacing.md },
  greenHeaderWide: { paddingHorizontal: spacing.lg },
  headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { ...typography.heading1, color: colors.white, fontSize: 32, lineHeight: 38, letterSpacing: 1.1 },
  profileButton: { width: 42, height: 42, borderRadius: radius.full, backgroundColor: colors.brandOverlay, alignItems: 'center', justifyContent: 'center' },
  searchBar: { minHeight: 52, paddingHorizontal: spacing.md, borderRadius: radius.full, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchPlaceholder: { ...typography.body, color: colors.textSecondary, flex: 1 },
  walletOverlap: { marginTop: -spacing.md, paddingHorizontal: spacing.xs, zIndex: 2 },
  sectionHeaderRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  sectionTitle: { ...typography.heading3, color: colors.text },
  seeAll: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: spacing.xxs },
  seeAllText: { ...typography.bodySmall, color: colors.textSecondary },
  categoriesRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  inlineFeedback: { minHeight: 64, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  feedbackCard: { minHeight: 72, justifyContent: 'center' },
  emptyCard: { minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: spacing.xs },
  emptyTitle: { ...typography.heading4, color: colors.text, textAlign: 'center' },
  helperText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  pressed: { opacity: 0.78 },
});
