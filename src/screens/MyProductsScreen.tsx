import React, { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useProducts, type ListingStatus } from '../context/ProductsContext';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

function ProductThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <View style={styles.productThumbnail}>
      {imageUrl && !imageFailed ? (
        <Image
          accessibilityLabel={`Imagem de ${name}`}
          source={{ uri: imageUrl }}
          style={styles.productThumbnailImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.productThumbnailPlaceholder}>
          <MaterialCommunityIcons name="image-outline" size={30} color={colors.primary} />
        </View>
      )}
    </View>
  );
}

export default function MyProductsScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { products, productsLoading, productsError, refreshProducts, updateProductStatus, deleteProduct } = useProducts();
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

  function confirmRemoval(product: typeof products[number]) {
    if (busyProductId) return;
    Alert.alert(
      'Remover anúncio?',
      'Sem pedidos, o anúncio será excluído definitivamente. Se houver histórico de pedidos, ele será apenas desativado para preservar os pedidos anteriores.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', style: 'destructive', onPress: () => { void handleRemoval(product.id); } },
      ],
    );
  }

  async function handleRemoval(id: string) {
    setOperationError(null);
    setBusyProductId(id);
    const result = await deleteProduct(id);
    setBusyProductId(null);
    if (result.error) {
      setOperationError(result.error);
      return;
    }
    Alert.alert(result.action === 'deleted' ? 'Anúncio excluído' : 'Anúncio desativado', result.action === 'deleted' ? 'O anúncio foi removido definitivamente.' : 'O anúncio possui histórico de pedidos e foi desativado para preservar os pedidos anteriores.');
  }

  function goBack() {
    if (navigation?.canGoBack?.()) navigation.goBack();
    else navigation?.navigate?.('SellerDashboard');
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar para Minha Loja" style={styles.backButton} onPress={goBack}>
          <MaterialCommunityIcons name="arrow-left" size={21} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ÁREA DO EMPREENDEDOR</Text>
          <Text style={styles.title}>Meus Produtos</Text>
          <Text style={styles.subtitle}>Gerencie seus produtos e serviços</Text>
        </View>
        <View style={styles.counter}>
          <Text style={styles.counterValue}>{productsLoading ? '—' : products.length}</Text>
          <Text style={styles.counterLabel}>anúncios</Text>
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Adicionar produto ou serviço"
        onPress={() => navigation.navigate('CreateProduct')}
        style={({ pressed }) => [styles.addButton, !wide && styles.addButtonFull, pressed && styles.pressed]}
      >
        <MaterialCommunityIcons name="plus" size={20} color={colors.white} />
        <Text style={styles.addButtonLabel}>Adicionar produto ou serviço</Text>
      </Pressable>

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

      {!productsLoading && !productsError && products.length === 0 ? <AppCard style={styles.emptyCard}>
        <View style={styles.emptyIcon}><MaterialCommunityIcons name="package-variant-closed" size={26} color={colors.brand} /></View>
        <Text style={styles.emptyTitle}>Você ainda não publicou anúncios</Text>
        <Text style={styles.emptyText}>Adicione um produto ou serviço para começar sua vitrine.</Text>
        <AppButton title="Adicionar produto ou serviço" variant="outline" onPress={() => navigation.navigate('CreateProduct')} />
      </AppCard> : null}

      <View style={styles.productsGrid}>
        {products.map((product) => (
          <View key={product.id} style={styles.productWrapper}>
            <AppCard elevated={wide} style={styles.productCard}>
              <View style={styles.productTopRow}>
                <ProductThumbnail imageUrl={product.imageUrl} name={product.name} />
                <View style={styles.productDetails}>
                  <View style={styles.badgesRow}>
                    <AppBadge label={product.type} variant="neutral" />
                    <AppBadge label={product.status === 'rascunho' ? 'Rascunho' : product.active ? 'Ativo' : 'Inativo'} variant={product.active ? 'success' : product.status === 'rascunho' ? 'warning' : 'neutral'} />
                  </View>

                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                  <Text style={styles.productPrice}>
                    {product.price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </Text>
                </View>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Opções de ${product.name}`} accessibilityState={{ busy: busyProductId === product.id }} style={styles.moreButton} onPress={() => confirmRemoval(product)} disabled={busyProductId !== null}>
                  <MaterialCommunityIcons name="dots-vertical" size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
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
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.smMd },
  backButton: { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.brand, letterSpacing: 0.7, fontWeight: '700' },
  title: { ...typography.heading2, color: colors.brandDark },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  counter: { minWidth: 60, minHeight: 56, paddingHorizontal: spacing.sm, borderRadius: radius.lg, backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  counterValue: { ...typography.heading3, color: colors.brandDark },
  counterLabel: { ...typography.caption, color: colors.brand, marginTop: 1 },
  addButton: { minHeight: 48, width: 260, maxWidth: '100%', paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.brand, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  addButtonFull: { width: '100%' },
  addButtonLabel: { ...typography.label, color: colors.white },
  pressed: { opacity: 0.82 },
  sectionHeader: { marginTop: 0 },
  sectionTitle: { ...typography.heading2, color: colors.text },
  sectionSubtitle: { ...typography.bodySmall, color: colors.textSecondary, marginTop: spacing.xs },
  productsGrid: { gap: spacing.md },
  productWrapper: { width: '100%' },
  productCard: { minHeight: 184, borderWidth: 1, borderColor: colors.border },
  productTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.smMd },
  productThumbnail: { width: 80, aspectRatio: 1, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  productThumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  productThumbnailPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  productDetails: { flex: 1, minWidth: 0 },
  moreButton: { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  badgesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  productName: { ...typography.heading4, color: colors.text, marginTop: spacing.sm },
  productPrice: { ...typography.heading3, color: colors.brandDark, marginTop: spacing.xs },
  infoCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandLight, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm },
  infoIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoText: { flex: 1, ...typography.caption, color: colors.textSecondary, marginLeft: spacing.sm },
  emptyCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.lg },
  emptyIcon: { width: 52, height: 52, borderRadius: radius.full, backgroundColor: colors.brandLight, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { ...typography.heading4, color: colors.text, textAlign: 'center' },
  emptyText: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  errorCard: { borderWidth: 1, borderColor: colors.error, gap: spacing.sm },
  errorText: { ...typography.bodySmall, color: colors.error },
  helperText: { ...typography.bodySmall, color: colors.textSecondary },
  retryButton: { alignSelf: 'flex-start' },
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionButton: { flex: 1, minHeight: 44, paddingHorizontal: spacing.sm },
});
