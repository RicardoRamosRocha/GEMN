import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { CategoryChip } from '../components/CategoryChip';
import { ProductCard } from '../components/ProductCard';
import { SellerDirectoryCard } from '../components/SellerDirectoryCard';
import { useProducts } from '../context/ProductsContext';
import { listActiveSellerDirectory, SellerDirectoryServiceError } from '../services/sellerDirectory';
import type { SellerDirectoryStore } from '../types/sellerDirectory';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const allCategory = { icon: 'apps' as const, label: 'Todas' };
const categoryIcons = ['food-apple-outline', 'tools', 'tshirt-crew-outline', 'home-outline', 'car-outline'] as const;

function categoryIcon(name: string, index: number) {
  const normalized = name.toLocaleLowerCase();
  if (normalized.includes('aliment') || normalized.includes('comida') || normalized.includes('food')) return 'food-apple-outline' as const;
  if (normalized.includes('serv') || normalized.includes('prof')) return 'tools' as const;
  if (normalized.includes('roup') || normalized.includes('moda')) return 'tshirt-crew-outline' as const;
  if (normalized.includes('casa') || normalized.includes('lar')) return 'home-outline' as const;
  if (normalized.includes('auto') || normalized.includes('trans')) return 'car-outline' as const;
  return categoryIcons[index % categoryIcons.length];
}

export default function MarketplaceScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const tablet = width >= layout.breakpoints.tablet;
  const columns = desktop ? 4 : tablet ? 3 : width >= 360 ? 2 : 1;
  const horizontalPadding = tablet ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const contentWidth = Math.min(width - horizontalPadding * 2, layout.contentMaxWidth - horizontalPadding * 2);
  const productGap = desktop ? spacing.lg : spacing.md;
  const productWidth = (contentWidth - productGap * (columns - 1)) / columns;
  const { marketplaceProducts, marketplaceLoading, marketplaceError, refreshMarketplaceProducts, categories: activeCategories } = useProducts();
  const [mode, setMode] = React.useState<'products' | 'stores'>('products');
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('Todas');
  const [storeSearch, setStoreSearch] = React.useState('');
  const [stores, setStores] = React.useState<SellerDirectoryStore[]>([]);
  const [storesLoading, setStoresLoading] = React.useState(false);
  const [storesLoadingMore, setStoresLoadingMore] = React.useState(false);
  const [storesError, setStoresError] = React.useState<string | null>(null);
  const [storesPage, setStoresPage] = React.useState(1);
  const [storesHasMore, setStoresHasMore] = React.useState(false);
  const storesRequestRef = React.useRef(0);

  const visibleProducts = marketplaceProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
    const query = search.trim().toLocaleLowerCase();
    return matchesCategory && (!query || `${product.name} ${product.description} ${product.sellerName ?? ''}`.toLocaleLowerCase().includes(query));
  });
  const marketplaceCategories = [allCategory, ...activeCategories.map((item, index) => ({ icon: categoryIcon(item.name, index), label: item.name }))];
  const hasActiveFilters = Boolean(search.trim()) || selectedCategory !== 'Todas';
  const clearFilters = () => { setSearch(''); setSelectedCategory('Todas'); };

  const loadStores = React.useCallback(async (term: string, page: number, append: boolean) => {
    const requestId = ++storesRequestRef.current;
    if (append) setStoresLoadingMore(true);
    else {
      setStoresLoading(true);
      setStoresLoadingMore(false);
      setStoresError(null);
      setStores([]);
      setStoresPage(1);
      setStoresHasMore(false);
    }
    try {
      const result = await listActiveSellerDirectory({ search: term, page, pageSize: 12 });
      if (requestId !== storesRequestRef.current) return;
      setStores((current) => {
        if (!append) return result.items;
        const existingIds = new Set(current.map((store) => store.id));
        return [...current, ...result.items.filter((store) => !existingIds.has(store.id))];
      });
      setStoresPage(page);
      setStoresHasMore(result.hasMore);
      setStoresError(null);
    } catch (error) {
      if (requestId !== storesRequestRef.current) return;
      setStoresError(error instanceof SellerDirectoryServiceError ? error.message : 'Não foi possível carregar as lojas. Tente novamente.');
    } finally {
      if (requestId === storesRequestRef.current) {
        setStoresLoading(false);
        setStoresLoadingMore(false);
      }
    }
  }, []);

  React.useEffect(() => {
    if (mode !== 'stores') return undefined;
    const timer = setTimeout(() => { void loadStores(storeSearch.trim(), 1, false); }, 350);
    return () => clearTimeout(timer);
  }, [loadStores, mode, storeSearch]);

  const retryStores = () => {
    const append = stores.length > 0 && storesHasMore;
    void loadStores(storeSearch.trim(), append ? storesPage + 1 : 1, append);
  };

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <View style={styles.institutionalBanner}>
        <View style={styles.bannerAccent} />
        <View style={styles.bannerHeader}><Text style={styles.bannerKicker}>GEMN • COMUNIDADE MUNDO NOVO</Text><MaterialCommunityIcons name="storefront-outline" size={42} color="rgba(255,255,255,0.82)" /></View>
        <View style={styles.bannerCopy}><Text style={styles.bannerTitle}>Valorize quem empreende na nossa comunidade.</Text><Text style={styles.bannerBody}>Descubra produtos e serviços dos empreendedores GEMN.</Text></View>
      </View>

      <View style={styles.modeSwitcher} accessibilityRole="tablist">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'products' }} onPress={() => setMode('products')} style={[styles.modeButton, mode === 'products' && styles.modeButtonActive]}><MaterialCommunityIcons name="view-grid-outline" size={18} color={mode === 'products' ? colors.white : colors.primary} /><Text style={[styles.modeButtonText, mode === 'products' && styles.modeButtonTextActive]}>Produtos e serviços</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'stores' }} onPress={() => setMode('stores')} style={[styles.modeButton, mode === 'stores' && styles.modeButtonActive]}><MaterialCommunityIcons name="storefront-outline" size={18} color={mode === 'stores' ? colors.white : colors.primary} /><Text style={[styles.modeButtonText, mode === 'stores' && styles.modeButtonTextActive]}>Lojas</Text></Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={21} color={colors.textSecondary} /><AppInput accessibilityLabel={mode === 'stores' ? 'Buscar lojas' : 'Buscar no marketplace'} placeholder={mode === 'stores' ? 'Buscar por nome ou descrição' : 'O que você procura?'} value={mode === 'stores' ? storeSearch : search} onChangeText={mode === 'stores' ? setStoreSearch : setSearch} containerStyle={styles.searchInputWrap} inputStyle={styles.searchInput} returnKeyType="search" /></View>
        {mode === 'products' ? <Pressable accessibilityRole="button" accessibilityLabel={hasActiveFilters ? 'Limpar filtros' : 'Filtros'} accessibilityState={{ disabled: !hasActiveFilters }} disabled={!hasActiveFilters} onPress={clearFilters} style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}><MaterialCommunityIcons name={hasActiveFilters ? 'filter-remove-outline' : 'tune-variant'} size={20} color={hasActiveFilters ? colors.white : colors.primary} /></Pressable> : null}
      </View>

      {mode === 'products' ? <View style={styles.filterSection}>
        <Text style={styles.eyebrow}>EXPLORE POR CATEGORIA</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {marketplaceCategories.map((category, index) => <CategoryChip key={category.label} icon={category.icon} label={category.label} tone={index} onPress={() => setSelectedCategory(category.label)} selected={selectedCategory === category.label} />)}
        </ScrollView>
      </View> : null}

      <View style={styles.resultsHeader}>
        <View><Text style={styles.resultsTitle}>{mode === 'stores' ? 'Lojas' : 'Produtos e serviços'}</Text><Text style={styles.resultsCount}>{mode === 'stores' ? 'Encontre lojas ativas da comunidade' : 'Feitos por empreendedores da comunidade'}</Text></View>
        {mode === 'stores' ? <AppButton title="Atualizar" size="compact" variant="outline" loading={storesLoading && stores.length > 0} disabled={storesLoading || storesLoadingMore} onPress={() => { void loadStores(storeSearch.trim(), 1, false); }} /> : null}
      </View>

      {mode === 'products' ? <>
        {marketplaceError ? <AppCard style={styles.errorCard}><Text style={styles.errorText}>{marketplaceError}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void refreshMarketplaceProducts(); }} /></AppCard> : null}
        {marketplaceLoading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Carregando anúncios publicados...</Text></View> : null}
        {!marketplaceLoading && !marketplaceError && visibleProducts.length === 0 ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>{hasActiveFilters ? 'Nenhum anúncio encontrado' : 'Ainda não há anúncios publicados'}</Text><Text style={styles.emptyBody}>{hasActiveFilters ? 'Tente buscar por outro termo ou limpar os filtros.' : 'Em breve, novos produtos e serviços da comunidade aparecerão aqui.'}</Text>{hasActiveFilters ? <AppButton title="Limpar filtros" size="compact" variant="outline" onPress={clearFilters} /> : null}</AppCard> : null}
        <View style={[styles.productGrid, desktop && styles.productGridDesktop]}>
          {visibleProducts.map((product) => {
            const price = product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            return <View key={product.id} style={[styles.productCell, { width: productWidth }]}><ProductCard layout="marketplace" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={price} coinPrice={product.gemnValue !== undefined ? `${product.gemnValue.toLocaleString('pt-BR')} GEMN` : undefined} seller={product.sellerName ?? 'Comunidade GEMN'} onPress={() => navigation.navigate('Product', { listing: product })} /></View>;
          })}
        </View>
      </> : <>
        {storesError ? <AppCard style={styles.errorCard}><Text style={styles.errorText}>{storesError}</Text><AppButton title="Tentar novamente" variant="outline" onPress={retryStores} /></AppCard> : null}
        {storesLoading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Carregando lojas...</Text></View> : null}
        {!storesLoading && stores.length === 0 && !storesError ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>{storeSearch.trim() ? 'Nenhuma loja encontrada' : 'Ainda não há lojas disponíveis'}</Text><Text style={styles.emptyBody}>{storeSearch.trim() ? 'Tente buscar por outro nome ou descrição.' : 'Lojas ativas da comunidade aparecerão aqui.'}</Text></AppCard> : null}
        <View style={[styles.productGrid, desktop && styles.productGridDesktop]}>
          {stores.map((store) => <View key={store.id} style={[styles.productCell, { width: productWidth }]}><SellerDirectoryCard store={store} onPress={() => navigation.navigate('SellerStorefront', { sellerId: store.id })} /></View>)}
        </View>
        {storesHasMore ? <View style={styles.loadMore}><AppButton title={storesLoadingMore ? 'Carregando...' : storesError ? 'Tentar novamente' : 'Carregar mais'} loading={storesLoadingMore} disabled={storesLoadingMore} variant="outline" onPress={() => { void loadStores(storeSearch.trim(), storesPage + 1, true); }} /></View> : null}
      </>}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.lg },
  modeSwitcher: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs, gap: spacing.xs },
  modeButton: { flex: 1, minHeight: 44, borderRadius: radius.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  modeButtonActive: { backgroundColor: colors.primary },
  modeButtonText: { ...typography.caption, color: colors.primary, textAlign: 'center' },
  modeButtonTextActive: { color: colors.white },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: { flex: 1, minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.xl, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInputWrap: { flex: 1 },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 48, paddingHorizontal: 0 },
  filterButton: { width: 52, height: 52, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryLight },
  filterButtonActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterSection: { gap: spacing.sm },
  eyebrow: { ...typography.caption, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.8 },
  categoryList: { gap: spacing.sm, paddingRight: spacing.md },
  institutionalBanner: { minHeight: 168, borderRadius: radius.xl, overflow: 'hidden', backgroundColor: colors.primary, padding: spacing.lg, justifyContent: 'center', position: 'relative' },
  bannerAccent: { position: 'absolute', right: -34, top: -38, width: 148, height: 148, borderRadius: 74, backgroundColor: colors.secondary },
  bannerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, zIndex: 1 },
  bannerCopy: { maxWidth: 600, gap: spacing.xs, zIndex: 1 },
  bannerKicker: { ...typography.label, color: '#C9D9FF', letterSpacing: 0.6 },
  bannerTitle: { ...typography.heading2, color: colors.white, maxWidth: 520 },
  bannerBody: { ...typography.bodySmall, color: '#E8F0FF', maxWidth: 520 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsTitle: { ...typography.heading2, color: colors.text },
  resultsCount: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  productGridDesktop: { gap: spacing.lg },
  productCell: { minWidth: 0 },
  errorCard: { borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  helperText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  emptyTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  emptyBody: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
  loadMore: { alignItems: 'center', paddingTop: spacing.xs },
});
