import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppCard, AppInput, AppScreen } from '../components/ui';
import { CategoryChip } from '../components/CategoryChip';
import { ProductCard } from '../components/ProductCard';
import { WalletCard } from '../components/WalletCard';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

const categories = [
  { icon: 'food-apple-outline' as const, label: 'Comida' },
  { icon: 'tools' as const, label: 'Serviços' },
  { icon: 'tshirt-crew-outline' as const, label: 'Moda' },
  { icon: 'package-variant-closed' as const, label: 'Outros' },
];

const highlights = [
  { icon: 'food-apple' as const, name: 'Cesta de frutas', price: 'R$ 30,00', seller: 'Mundo Novo', category: 'Comida', coinPrice: '15 GEMN', rating: '4.9' },
  { icon: 'tshirt-crew' as const, name: 'Camiseta', price: 'R$ 45,00', seller: 'GEMN Store', category: 'Moda', coinPrice: '22 GEMN', rating: '4.8' },
];

export default function HomeScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.breakpoints.desktop;
  const tablet = width >= layout.breakpoints.tablet;
  const horizontalPadding = tablet ? layout.desktopHorizontalPadding : layout.mobileHorizontalPadding;
  const contentWidth = Math.min(width - horizontalPadding * 2, layout.contentMaxWidth - horizontalPadding * 2);
  const productGap = desktop ? spacing.lg : spacing.md;
  const productWidth = tablet ? (contentWidth - productGap) / 2 : contentWidth;

  return (
    <AppScreen scroll contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={styles.greetingBlock}>
          <Text style={styles.greeting}>Olá, Ricardo</Text>
          <View style={styles.communityLine}><View style={styles.communityDot} /><Text style={styles.community}>Comunidade Mundo Novo</Text></View>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir perfil" style={styles.profileButton} onPress={() => navigation.navigate('Perfil', { screen: 'ProfileHome' })}>
          <MaterialCommunityIcons name="account-outline" size={23} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={21} color={colors.textSecondary} />
          <AppInput accessibilityLabel="Buscar produtos ou serviços" placeholder={tablet ? 'Buscar produtos ou serviços' : 'Buscar na comunidade'} containerStyle={styles.searchInputWrap} inputStyle={styles.searchInput} returnKeyType="search" />
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Filtros" style={styles.filterButton}>
          <MaterialCommunityIcons name="tune-variant" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={[styles.topGrid, desktop && styles.topGridDesktop]}>
        <WalletCard />
        {tablet ? <AppCard style={styles.welcomeCard}>
          <AppBadge label="DA COMUNIDADE, PARA A COMUNIDADE" variant="success" />
          <Text style={styles.welcomeTitle}>Boas trocas começam por aqui.</Text>
          <Text style={styles.welcomeBody}>Descubra produtos e serviços de quem empreende perto de você.</Text>
        </AppCard> : null}
      </View>

      <View style={styles.sectionHeader}>
        <View><Text style={styles.sectionTitle}>{tablet ? 'Explore por categoria' : 'Categorias'}</Text>{tablet ? <Text style={styles.sectionSub}>Encontre o que precisa na comunidade</Text> : null}</View>
      </View>
      {tablet ? (
        <View style={styles.categoryGrid}>{categories.map((item) => <CategoryChip key={item.label} icon={item.icon} label={item.label} compact />)}</View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>{categories.map((item) => <CategoryChip key={item.label} icon={item.icon} label={item.label} />)}</ScrollView>
      )}

      <View style={[styles.sectionHeader, styles.highlightHeader]}>
        <View><Text style={styles.sectionTitle}>{tablet ? 'Feito por aqui' : 'Destaques'}</Text>{tablet ? <Text style={styles.sectionSub}>Destaques de empreendedores locais</Text> : null}</View>
        <TouchableOpacity accessibilityRole="button" onPress={() => navigation.navigate('Marketplace', { screen: 'MarketplaceHome' })} style={styles.seeAll}><Text style={styles.seeAllText}>Explorar</Text><MaterialCommunityIcons name="arrow-right" size={16} color={colors.primary} /></TouchableOpacity>
      </View>
      <View style={[styles.productGrid, desktop && styles.productGridDesktop]}>
        {highlights.map((product) => <View key={product.name} style={[styles.productCell, { width: productWidth }]}><ProductCard {...product} onPress={() => navigation.navigate('Product', { name: product.name, price: product.price, icon: product.icon })} /></View>)}
      </View>

      {tablet ? <AppCard style={styles.communityNote}>
        <View style={styles.noteIcon}><MaterialCommunityIcons name="account-group-outline" size={22} color={colors.primary} /></View>
        <View style={styles.noteCopy}><Text style={styles.noteTitle}>Cada compra fortalece a comunidade</Text><Text style={styles.noteBody}>Apoie quem empreende em Mundo Novo e faça a economia local circular.</Text></View>
      </AppCard> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  greetingBlock: { gap: spacing.xs },
  greeting: { ...typography.heading1, color: colors.text },
  communityLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  communityDot: { width: 7, height: 7, borderRadius: radius.full, backgroundColor: colors.primary },
  community: { ...typography.bodySmall, color: colors.textSecondary },
  profileButton: { width: 46, height: 46, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  searchBox: { flex: 1, minHeight: 52, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, gap: spacing.sm },
  searchInputWrap: { flex: 1 },
  searchInput: { borderWidth: 0, backgroundColor: 'transparent', minHeight: 48, paddingHorizontal: 0 },
  filterButton: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  topGrid: { gap: spacing.md },
  topGridDesktop: { flexDirection: 'row', alignItems: 'stretch' },
  welcomeCard: { flex: 1, justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  welcomeTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.xs },
  welcomeBody: { ...typography.bodySmall, color: colors.textSecondary },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSub: { ...typography.bodySmall, color: colors.textSecondary, marginTop: 2 },
  categoryScroll: { gap: spacing.sm, paddingRight: spacing.md },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  highlightHeader: { marginTop: spacing.sm },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.xs },
  seeAllText: { ...typography.label, color: colors.primary },
  productGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  productGridDesktop: { gap: spacing.lg },
  productCell: {},
  communityNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.primaryLight },
  noteIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  noteCopy: { flex: 1, gap: spacing.xs },
  noteTitle: { ...typography.label, color: colors.text },
  noteBody: { ...typography.bodySmall, color: colors.textSecondary },
});
