import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { CategoryChip } from '../components/CategoryChip';
import { ProductCard } from '../components/ProductCard';
import { SellerDirectoryCard } from '../components/SellerDirectoryCard';
import { useProducts } from '../context/ProductsContext';
import { useCart } from '../context/CartContext';
import type { GemnProduct } from '../context/ProductsContext';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { listActiveSellerDirectory, SellerDirectoryServiceError } from '../services/sellerDirectory';
import type { SellerDirectoryStore } from '../types/sellerDirectory';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

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

export default function MarketplaceScreen({ navigation, route }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const tablet = width >= layout.breakpoints.tablet;
  const mobile = !tablet;
  const columns = desktop ? 4 : tablet ? 3 : width >= 340 ? 2 : 1;
  const horizontalPadding = tablet ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const contentWidth = Math.min(width - horizontalPadding * 2, layout.contentMaxWidth - horizontalPadding * 2);
  const productGap = desktop ? spacing.lg : tablet ? spacing.md : 12;
  const productWidth = Math.floor((contentWidth - productGap * (columns - 1)) / columns);
  const carouselGap = desktop ? spacing.lg : spacing.md;
  const carouselVisibleCards = desktop ? 3.35 : tablet ? 2.35 : 1.35;
  const carouselCardWidth = Math.floor(contentWidth / carouselVisibleCards);
  const { marketplaceProducts, marketplaceLoading, marketplaceError, refreshMarketplaceProducts, categories: activeCategories } = useProducts();
  const { itemCount } = useCart();
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

  React.useEffect(() => {
    const params = route?.params;
    if (typeof params?.search === 'string') setSearch(params.search);
    if (typeof params?.category === 'string') setSelectedCategory(params.category);
  }, [route?.params?.search, route?.params?.category]);

  const visibleProducts = marketplaceProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
    const query = search.trim().toLocaleLowerCase();
    return matchesCategory && (!query || `${product.name} ${product.description} ${product.sellerName ?? ''}`.toLocaleLowerCase().includes(query));
  });
  const marketplaceCategories = [allCategory, ...activeCategories.map((item, index) => ({ icon: categoryIcon(item.name, index), label: item.name }))];
  const hasActiveFilters = Boolean(search.trim()) || selectedCategory !== 'Todas';
  const categoryFilterActive = selectedCategory !== 'Todas';
  const searchValue = mode === 'stores' ? storeSearch : search;
  const clearFilters = () => { setSearch(''); setSelectedCategory('Todas'); };
  const clearSearch = () => { if (mode === 'stores') setStoreSearch(''); else setSearch(''); };

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
      <View style={styles.marketHeader}><Text style={styles.marketTitle}>Marketplace</Text><Pressable accessibilityRole="button" accessibilityLabel="Abrir carrinho" onPress={() => navigation.navigate('Cart')} style={styles.cartButton}><MaterialCommunityIcons name="cart-outline" size={23} color={colors.brand} />{itemCount > 0 ? <View style={styles.cartBadge}><Text style={styles.cartBadgeText}>{itemCount > 99 ? '99+' : itemCount}</Text></View> : null}</Pressable></View>

      <View style={styles.modeSwitcher} accessibilityRole="tablist">
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'products' }} onPress={() => setMode('products')} style={[styles.modeButton, mode === 'products' && styles.modeButtonActive]}><MaterialCommunityIcons name="view-grid-outline" size={19} color={colors.brand} /><Text style={[styles.modeButtonText, mode === 'products' && styles.modeButtonTextActive]}>Produtos e serviços</Text></Pressable>
        <Pressable accessibilityRole="tab" accessibilityState={{ selected: mode === 'stores' }} onPress={() => setMode('stores')} style={[styles.modeButton, mode === 'stores' && styles.modeButtonActive]}><MaterialCommunityIcons name="storefront-outline" size={19} color={colors.brand} /><Text style={[styles.modeButtonText, mode === 'stores' && styles.modeButtonTextActive]}>Lojas</Text></Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchField}>
          <AppInput
            variant="marketplaceSearch"
            icon="magnify"
            accessibilityLabel={mode === 'stores' ? 'Buscar lojas' : 'Buscar no marketplace'}
            placeholder={mode === 'stores' ? 'Buscar por nome ou descrição' : 'Buscar produtos ou serviços...'}
            placeholderTextColor={colors.textSecondary}
            value={searchValue}
            onChangeText={mode === 'stores' ? setStoreSearch : setSearch}
            returnKeyType="search"
            containerStyle={styles.searchInputContainer}
            inputStyle={styles.searchInput}
          />
          {searchValue ? <Pressable accessibilityRole="button" accessibilityLabel="Limpar busca" hitSlop={6} onPress={clearSearch} style={styles.clearSearchButton}><MaterialCommunityIcons name="close-circle" size={19} color={colors.textSecondary} /></Pressable> : null}
        </View>
        {mode === 'products' ? <Pressable accessibilityRole="button" accessibilityLabel={hasActiveFilters ? 'Limpar filtros' : 'Filtros'} accessibilityState={{ disabled: !hasActiveFilters }} disabled={!hasActiveFilters} onPress={clearFilters} style={[styles.filterButton, hasActiveFilters && styles.filterButtonActive]}><MaterialCommunityIcons name={hasActiveFilters ? 'filter-remove-outline' : 'tune-variant'} size={20} color={hasActiveFilters ? colors.white : colors.primary} />{categoryFilterActive ? <View style={styles.filterIndicator} /> : null}</Pressable> : null}
      </View>

      {mode === 'products' ? <View style={styles.filterSection}>
        <Text style={styles.eyebrow}>Explore por categoria</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {marketplaceCategories.map((category, index) => <CategoryChip key={category.label} compact variant="marketplace" icon={category.icon} label={category.label} tone={index} onPress={() => setSelectedCategory(category.label)} selected={selectedCategory === category.label} />)}
        </ScrollView>
      </View> : null}

      {(mode === 'stores' || tablet) ? <View style={styles.resultsHeader}>
        <View style={styles.resultsHeaderCopy}>
          <View style={styles.resultsTitleRow}>
            <Text style={styles.resultsTitle}>{mode === 'stores' ? 'Lojas' : 'Produtos e serviços'}</Text>
            {mode === 'products' && !marketplaceLoading && !marketplaceError ? <View style={styles.resultsCountBadge}><Text style={styles.resultsCountBadgeText}>{visibleProducts.length}</Text></View> : null}
          </View>
          <Text style={styles.resultsCount}>
            {mode === 'stores'
              ? (storesLoading && stores.length === 0 ? 'Carregando lojas ativas...' : storeSearch.trim() ? `Resultados para “${storeSearch.trim()}”` : 'Lojas ativas da comunidade')
              : marketplaceLoading ? 'Carregando anúncios...' : marketplaceError ? 'Não foi possível carregar os anúncios' : `${visibleProducts.length} ${visibleProducts.length === 1 ? 'anúncio encontrado' : 'anúncios encontrados'}`}
          </Text>
        </View>
        {mode === 'stores' ? <AppButton title="Atualizar" size="compact" variant="outline" loading={storesLoading && stores.length > 0} disabled={storesLoading || storesLoadingMore} onPress={() => { void loadStores(storeSearch.trim(), 1, false); }} /> : null}
      </View> : null}

      {mode === 'products' ? <>
        {marketplaceError ? <AppCard style={styles.errorCard}><Text style={styles.errorText}>{marketplaceError}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void refreshMarketplaceProducts(); }} /></AppCard> : null}
        {marketplaceLoading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Carregando anúncios publicados...</Text></View> : null}
        {!marketplaceLoading && !marketplaceError && visibleProducts.length === 0 ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>{hasActiveFilters ? 'Nenhum anúncio encontrado' : 'Ainda não há anúncios publicados'}</Text><Text style={styles.emptyBody}>{hasActiveFilters ? 'Tente buscar por outro termo ou limpar os filtros.' : 'Em breve, novos produtos e serviços da comunidade aparecerão aqui.'}</Text>{hasActiveFilters ? <AppButton title="Limpar filtros" size="compact" variant="outline" onPress={clearFilters} /> : null}</AppCard> : null}
        {visibleProducts.length > 0 ? mobile ? <MarketplaceProductList products={visibleProducts} onPress={(product, index) => navigation.navigate('Product', { listing: product, listingSequence: visibleProducts, listingIndex: index })} onSellerPress={(sellerId) => navigation.navigate('SellerStorefront', { sellerId })} /> : <MarketplaceProductCarousel products={visibleProducts} cardWidth={carouselCardWidth} gap={carouselGap} desktop={desktop} onPress={(product, index) => navigation.navigate('Product', { listing: product, listingSequence: visibleProducts, listingIndex: index })} onSellerPress={(sellerId) => navigation.navigate('SellerStorefront', { sellerId })} /> : null}
      </> : <>
        {storesError ? <AppCard style={styles.errorCard}><Text style={styles.errorText}>{storesError}</Text><AppButton title="Tentar novamente" variant="outline" onPress={retryStores} /></AppCard> : null}
        {storesLoading ? <View style={styles.loadingState}><ActivityIndicator color={colors.primary} /><Text style={styles.helperText}>Carregando lojas...</Text></View> : null}
        {!storesLoading && stores.length === 0 && !storesError ? <AppCard style={styles.emptyCard}><View style={styles.emptyIcon}><MaterialCommunityIcons name="store-search-outline" size={28} color={colors.primary} /></View><Text style={styles.emptyTitle}>{storeSearch.trim() ? 'Nenhuma loja encontrada' : 'Ainda não há lojas disponíveis'}</Text><Text style={styles.emptyBody}>{storeSearch.trim() ? 'Tente buscar por outro nome ou descrição.' : 'Lojas ativas da comunidade aparecerão aqui.'}</Text></AppCard> : null}
        <ResponsiveGrid items={stores} columns={columns} itemWidth={productWidth} gap={productGap} renderItem={(store) => <SellerDirectoryCard store={store} onPress={() => navigation.navigate('SellerStorefront', { sellerId: store.id })} />} />
        {storesHasMore ? <View style={styles.loadMore}><AppButton title={storesLoadingMore ? 'Carregando...' : storesError ? 'Tentar novamente' : 'Carregar mais'} loading={storesLoadingMore} disabled={storesLoadingMore} variant="outline" onPress={() => { void loadStores(storeSearch.trim(), storesPage + 1, true); }} /></View> : null}
      </>}
    </AppScreen>
  );
}

type GridItem = { id: string };

function MarketplaceProductCarousel({ products, cardWidth, gap, desktop, onPress, onSellerPress }: { products: GemnProduct[]; cardWidth: number; gap: number; desktop: boolean; onPress: (product: GemnProduct, index: number) => void; onSellerPress: (sellerId: string) => void }) {
  const scrollRef = React.useRef<ScrollView>(null);
  const [offset, setOffset] = React.useState(0);
  const step = cardWidth + gap;
  const canScrollBack = offset > 4;

  function scrollBy(direction: -1 | 1) {
    scrollRef.current?.scrollTo({ x: Math.max(0, offset + direction * step * (desktop ? 2 : 1)), animated: true });
  }

  return <View style={styles.carouselWrap}>
    {desktop ? <View style={styles.carouselControls}><Pressable accessibilityRole="button" accessibilityLabel="Anúncios anteriores" disabled={!canScrollBack} onPress={() => scrollBy(-1)} style={[styles.carouselArrow, !canScrollBack && styles.carouselArrowDisabled]}><MaterialCommunityIcons name="chevron-left" size={22} color={canScrollBack ? colors.brandDark : colors.textMuted} /></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Próximos anúncios" onPress={() => scrollBy(1)} style={styles.carouselArrow}><MaterialCommunityIcons name="chevron-right" size={22} color={colors.brandDark} /></Pressable></View> : null}
    <ScrollView ref={scrollRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.carouselList, { gap }]} scrollEventThrottle={16} onScroll={(event) => setOffset(event.nativeEvent.contentOffset.x)}>
      {products.map((product, index) => {
        const price = product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
        return <View key={product.id} style={[styles.carouselItem, { width: cardWidth }]}><ProductCard layout="marketplace" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={price} coinPrice={gemnEligibility.enabled && gemnEligibility.value !== undefined ? `${gemnEligibility.value.toLocaleString('pt-BR')} GEMN` : undefined} seller={product.sellerName ?? ''} sellerId={product.sellerId} onSellerPress={onSellerPress} onPress={() => onPress(product, index)} /></View>;
      })}
      <View style={styles.carouselEnd} accessibilityLabel="Mais anúncios à direita"><MaterialCommunityIcons name="arrow-right" size={20} color={colors.brand} /></View>
    </ScrollView>
  </View>;
}

function MarketplaceProductList({ products, onPress, onSellerPress }: { products: GemnProduct[]; onPress: (product: GemnProduct, index: number) => void; onSellerPress: (sellerId: string) => void }) {
  return <View style={styles.mobileProductList}>
    {products.map((product, index) => {
      const price = product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: product.sellerAcceptsGemn, listingAcceptsGemn: product.acceptsGemn, gemnValue: product.gemnValue });
      return <ProductCard key={product.id} layout="marketplaceList" icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={price} coinPrice={gemnEligibility.enabled && gemnEligibility.value !== undefined ? `${gemnEligibility.value.toLocaleString('pt-BR')} GEMN` : undefined} seller={product.sellerName ?? ''} sellerId={product.sellerId} onSellerPress={onSellerPress} onPress={() => onPress(product, index)} />;
    })}
  </View>;
}

function ResponsiveGrid<T extends GridItem>({ items, columns, itemWidth, gap, renderItem }: { items: T[]; columns: number; itemWidth: number; gap: number; renderItem: (item: T) => React.ReactNode }) {
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += columns) rows.push(items.slice(index, index + columns));

  return (
    <View style={styles.productGrid}>
      {rows.map((row, rowIndex) => <View key={`grid-row-${rowIndex}`} style={[styles.productRow, { gap }]}>{row.map((item) => <View key={item.id} style={[styles.productCell, { width: itemWidth }]}>{renderItem(item)}</View>)}</View>)}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  marketHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', position: 'relative' },
  marketTitle: { ...typography.heading2, color: colors.text },
  cartButton: { position: 'absolute', right: 0, width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  cartBadge: { position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 3, borderRadius: radius.full, backgroundColor: colors.gemn, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.surface },
  cartBadgeText: { ...typography.caption, color: colors.brandDark, fontSize: 10, lineHeight: 12, fontWeight: '700' },
  modeSwitcher: { flexDirection: 'row', backgroundColor: colors.brandLight, borderRadius: radius.full, padding: spacing.xs, gap: spacing.xxs, borderWidth: 1, borderColor: colors.brandLight },
  modeButton: { flex: 1, minHeight: 40, borderRadius: radius.full, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingHorizontal: spacing.md },
  modeButtonActive: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  modeButtonText: { ...typography.caption, color: colors.brandDark, textAlign: 'center' },
  modeButtonTextActive: { color: colors.brandDark, fontWeight: '700' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchField: { flex: 1, position: 'relative' },
  searchInputContainer: { width: '100%' },
  searchInput: { paddingRight: spacing.xl },
  clearSearchButton: { position: 'absolute', top: 6, right: spacing.xs, width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  filterButton: { width: 52, height: 52, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, position: 'relative' },
  filterButtonActive: { backgroundColor: colors.brandDark, borderColor: colors.brandDark },
  filterIndicator: { position: 'absolute', top: 7, right: 7, width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.gemn, borderWidth: 1, borderColor: colors.white },
  filterSection: { gap: spacing.sm, paddingTop: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.brand, fontWeight: '700', letterSpacing: 0.8 },
  categoryList: { gap: spacing.sm, paddingRight: spacing.md },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  resultsHeaderCopy: { flex: 1, minWidth: 0 },
  resultsTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  resultsTitle: { ...typography.heading2, color: colors.text },
  resultsCount: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  resultsCountBadge: { minWidth: 28, height: 24, paddingHorizontal: spacing.xs, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primaryLight },
  resultsCountBadgeText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  carouselWrap: { width: '100%', gap: spacing.sm },
  carouselControls: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  carouselArrow: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, ...shadows.subtle },
  carouselArrowDisabled: { opacity: 0.5 },
  carouselList: { paddingRight: spacing.lg, alignItems: 'stretch' },
  carouselItem: { flexShrink: 0 },
  carouselEnd: { width: 36, minHeight: 48, alignSelf: 'center', borderRadius: radius.full, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  mobileProductList: { width: '100%', gap: spacing.sm },
  productGrid: { width: '100%', gap: spacing.md },
  productRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'flex-start' },
  productCell: { minWidth: 0, flexGrow: 0, flexShrink: 0 },
  errorCard: { borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  loadingState: { minHeight: 160, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  helperText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl, borderWidth: 1, borderColor: colors.border },
  emptyIcon: { width: 56, height: 56, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  emptyTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  emptyBody: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center', maxWidth: 420 },
  loadMore: { alignItems: 'center', paddingTop: spacing.xs },
});
