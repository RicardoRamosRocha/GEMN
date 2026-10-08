import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppHeader, AppInput, AppScreen } from '../components/ui';
import { CategoryChip } from '../components/CategoryChip';
import { ProductCard } from '../components/ProductCard';
import { useProducts } from '../context/ProductsContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const categories = [
  { icon: 'apps' as const, label: 'Todas' },
];

const categoryIcons = ['food-apple-outline', 'tools', 'tshirt-crew-outline', 'home-outline', 'car-outline'] as const;

export default function MarketplaceScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const tablet = width >= layout.breakpoints.tablet;
  const columns = desktop ? 4 : tablet ? 3 : 1;
  const horizontalPadding = tablet ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const contentWidth = Math.min(width - horizontalPadding * 2, layout.contentMaxWidth - horizontalPadding * 2);
  const productGap = desktop ? spacing.lg : spacing.md;
  const productWidth = (contentWidth - productGap * (columns - 1)) / columns;
  const { marketplaceProducts, marketplaceLoading, marketplaceError, refreshMarketplaceProducts, categories: activeCategories } = useProducts();
  const [search, setSearch] = React.useState('');
  const [selectedCategory, setSelectedCategory] = React.useState('Todas');
  const visibleProducts = marketplaceProducts.filter((product) => {
    const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
    const query = search.trim().toLocaleLowerCase();
    return matchesCategory && (!query || `${product.name} ${product.description} ${product.sellerName ?? ''}`.toLocaleLowerCase().includes(query));
  });
  const marketplaceCategories = [categories[0], ...activeCategories.map((item, index) => ({ icon: categoryIcons[index % categoryIcons.length], label: item.name }))];

  return (
    <AppScreen scroll contentContainerStyle={styles.content}>
      <View style={styles.headingRow}>
        <AppHeader title="Marketplace" subtitle={tablet ? 'Descubra produtos e serviços da comunidade' : undefined} style={styles.header} />
        {tablet ? <View style={styles.memberPill}><View style={styles.memberDot} /><Text style={styles.memberText}>Comunidade Mundo Novo</Text></View> : null}
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}><MaterialCommunityIcons name="magnify" size={21} color={colors.textSecondary} /><AppInput accessibilityLabel="Buscar no marketplace" placeholder="O que você procura?" value={search} onChangeText={setSearch} containerStyle={styles.searchInputWrap} inputStyle={styles.searchInput} returnKeyType="search" /></View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Filtros" style={styles.filterButton}><MaterialCommunityIcons name="tune-variant" size={20} color={colors.white} /></TouchableOpacity>
      </View>

      <View style={styles.filterSection}>
        {tablet ? <Text style={styles.eyebrow}>CATEGORIAS</Text> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryList}>
          {marketplaceCategories.map((category, index) => <CategoryChip key={category.label} icon={category.icon} label={category.label} compact={index !== 0} onPress={() => setSelectedCategory(category.label)} selected={selectedCategory === category.label} />)}
        </ScrollView>
      </View>

      {tablet ? <AppCard style={[styles.discoveryNote, desktop && styles.discoveryNoteDesktop]}>
        <View style={styles.discoveryIcon}><MaterialCommunityIcons name="storefront-outline" size={22} color={colors.primary} /></View>
        <View style={styles.discoveryCopy}><Text style={styles.discoveryTitle}>Negócios locais, boas descobertas</Text><Text style={styles.discoveryBody}>Encontre membros e empreendedores da comunidade.</Text></View>
        <View style={styles.gemnLegend}><MaterialCommunityIcons name="star-four-points" size={14} color="#886512" /><Text style={styles.gemnLegendText}>Aceita GEMN</Text></View>
      </AppCard> : null}

      <View style={styles.resultsHeader}>
          <View><Text style={styles.resultsTitle}>{tablet ? 'Produtos e serviços' : 'Para você'}</Text>{tablet ? <Text style={styles.resultsCount}>{visibleProducts.length} opções para descobrir</Text> : null}</View>
        {tablet ? <TouchableOpacity accessibilityRole="button" style={styles.sortButton}><MaterialCommunityIcons name="sort-variant" size={17} color={colors.textSecondary} /><Text style={styles.sortText}>Relevância</Text><MaterialCommunityIcons name="chevron-down" size={16} color={colors.textSecondary} /></TouchableOpacity> : null}
      </View>

      {marketplaceError ? <AppCard style={styles.errorCard}><Text style={styles.errorText}>{marketplaceError}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void refreshMarketplaceProducts(); }} /></AppCard> : null}
      {marketplaceLoading ? <Text style={styles.helperText}>Carregando anúncios publicados...</Text> : null}
      {!marketplaceLoading && !marketplaceError && visibleProducts.length === 0 ? <Text style={styles.helperText}>Nenhum anúncio publicado encontrado.</Text> : null}
      <View style={[styles.productGrid, desktop && styles.productGridDesktop]}>
        {visibleProducts.map((product) => {
          const price = product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          return <View key={product.id} style={[styles.productCell, { width: productWidth }]}><ProductCard icon={product.icon} imageUrl={product.imageUrl} category={product.category} name={product.name} price={price} coinPrice={product.gemnValue !== undefined ? `${product.gemnValue.toLocaleString('pt-BR')} GEMN` : undefined} seller={product.sellerName ?? 'Comunidade GEMN'} onPress={() => navigation.navigate('Product', { listing: product })} /></View>;
        })}
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  headingRow: { gap: spacing.md },
  header: { minHeight: 0 },
  memberPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.md, minHeight: 34, borderRadius: radius.full, backgroundColor: colors.surfaceMuted },
  memberDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.primary },
  memberText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  searchBox: { flex: 1, minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInputWrap: { flex: 1 },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 48, paddingHorizontal: 0 },
  filterButton: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary },
  filterSection: { gap: spacing.sm },
  eyebrow: { ...typography.caption, color: colors.textMuted, fontWeight: '700', letterSpacing: 0.8 },
  categoryList: { gap: spacing.sm, paddingRight: spacing.md },
  discoveryNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryLight },
  discoveryNoteDesktop: { maxWidth: 720 },
  discoveryIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  discoveryCopy: { flex: 1, gap: 2 },
  discoveryTitle: { ...typography.label, color: colors.text },
  discoveryBody: { ...typography.caption, color: colors.textSecondary },
  gemnLegend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gemnLegendText: { ...typography.caption, color: '#886512', fontWeight: '600' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultsTitle: { ...typography.heading2, color: colors.text },
  resultsCount: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  sortButton: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm },
  sortText: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  productGridDesktop: { gap: spacing.lg },
  productCell: { minWidth: 0 },
  errorCard: { borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  helperText: { ...typography.bodySmall, color: colors.textSecondary },
});
