import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useProducts, type ListingStatus } from '../context/ProductsContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

export default function MyProductsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { products, productsLoading, productsError, refreshProducts, updateProductStatus } = useProducts();
  const [busyProductId, setBusyProductId] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);

  async function handleStatusChange(id: string, status: ListingStatus) {
    if (busyProductId) return;
    setOperationError(null);
    setBusyProductId(id);
    const result = await updateProductStatus(id, status);
    setBusyProductId(null);
    if (result.error) setOperationError(result.error);
  }

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Sua vitrine na comunidade</Text>
          <Text style={styles.title}>Meus produtos</Text>
          <Text style={styles.subtitle}>Gerencie seus produtos e serviços</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterValue}>{productsLoading ? '—' : products.length}</Text>
          <Text style={styles.counterLabel}>anúncios</Text>
        </View>
      </View>

      <AppButton
        title="Adicionar produto ou serviço"
        onPress={() => navigation.navigate('CreateProduct')}
        style={styles.addButton}
      />

      <View style={styles.sectionHeader}>
        <View>
          <Text style={styles.sectionTitle}>Seus anúncios</Text>
          <Text style={styles.sectionSubtitle}>Visíveis para os membros da comunidade</Text>
        </View>
      </View>

      {productsError ? (
        <AppCard style={styles.errorCard}>
          <Text style={styles.errorText}>{productsError}</Text>
          <AppButton title="Tentar novamente" variant="outline" onPress={() => { void refreshProducts(); }} style={styles.retryButton} />
        </AppCard>
      ) : null}

      {productsLoading ? <Text style={styles.helperText}>Carregando seus anúncios...</Text> : null}
      {operationError ? <Text style={styles.errorText}>{operationError}</Text> : null}

      <View style={[styles.productsGrid, wide && styles.productsGridWide]}>
        {products.map((product) => (
          <View key={product.id} style={[styles.productWrapper, wide && styles.productWrapperWide]}>
            <AppCard elevated={wide} style={styles.productCard}>
              <View style={styles.productTopRow}>
                <View style={styles.productIcon}>
                  <MaterialCommunityIcons name={product.icon} size={30} color={colors.primary} />
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Opções de ${product.name}`} style={styles.moreButton}>
                  <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <View style={styles.badgesRow}>
                <AppBadge label={product.type} variant="neutral" />
                <AppBadge label={product.status === 'rascunho' ? 'Rascunho' : product.active ? 'Ativo' : 'Inativo'} variant={product.active ? 'success' : product.status === 'rascunho' ? 'warning' : 'neutral'} />
              </View>

              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productPrice}>
                {product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </Text>
              <View style={styles.actionsRow}>
                <AppButton title="Editar" variant="outline" onPress={() => navigation.navigate('CreateProduct', { product })} disabled={busyProductId !== null} style={styles.actionButton} />
                <AppButton
                  title={product.status === 'ativo' ? 'Desativar' : 'Ativar'}
                  variant={product.status === 'ativo' ? 'secondary' : 'primary'}
                  onPress={() => { void handleStatusChange(product.id, product.status === 'ativo' ? 'inativo' : 'ativo'); }}
                  loading={busyProductId === product.id}
                  disabled={busyProductId !== null && busyProductId !== product.id}
                  style={styles.actionButton}
                />
              </View>
            </AppCard>
          </View>
        ))}
      </View>

      <AppCard style={styles.infoCard}>
        <View style={styles.infoIcon}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
        </View>
        <Text style={styles.infoText}>Anúncios ativos podem ser encontrados no Marketplace GEMN. Rascunhos e inativos ficam disponíveis somente nesta área.</Text>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  counter: { minWidth: 68, minHeight: 68, borderRadius: radius.lg, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  counterValue: { ...typography.heading3, color: colors.primary },
  counterLabel: { ...typography.caption, color: colors.primary, marginTop: 1 },
  addButton: { width: '100%', minHeight: 52 },
  sectionHeader: { marginTop: spacing.xs },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  productsGrid: { gap: spacing.md },
  productsGridWide: { flexDirection: 'row', flexWrap: 'wrap' },
  productWrapper: { width: '100%' },
  productWrapperWide: { width: '48%' },
  productCard: { minHeight: 208, borderWidth: 1, borderColor: colors.border },
  productTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  productIcon: { width: 58, height: 58, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  moreButton: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md },
  productName: { ...typography.heading3, color: colors.text, marginTop: spacing.sm },
  productPrice: { ...typography.heading2, color: colors.primary, marginTop: spacing.xs },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, borderWidth: 1, borderColor: colors.primaryLight },
  infoIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, ...typography.bodySmall, color: colors.textSecondary, marginLeft: spacing.md },
  errorCard: { borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  helperText: { ...typography.bodySmall, color: colors.textSecondary },
  retryButton: { alignSelf: 'flex-start' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  actionButton: { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm },
});
