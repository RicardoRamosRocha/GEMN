import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppHeader, AppScreen } from '../components/ui';
import { useCart } from '../context/CartContext';
import { useProducts, type GemnProduct } from '../context/ProductsContext';
import { CartValidationError, validateCart } from '../services/cartValidation';
import type { CartKnownListing, CartValidationItem, CartValidationResult } from '../types/cart';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type CartScreenProps = { navigation: { goBack: () => void } };

type ResolvedCartItem = {
  cartId: string;
  product: GemnProduct | null;
  sellerId: string;
  quantity: number;
  validationItem?: CartValidationItem;
};

function formatPrice(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function ProductImage({ product }: { product: GemnProduct | null }) {
  return product?.imageUrl
    ? <Image source={{ uri: product.imageUrl }} style={styles.productImage} />
    : <View style={styles.productPlaceholder}><MaterialCommunityIcons name={product?.icon ?? 'package-variant-closed'} size={28} color={colors.primary} /></View>;
}

export default function CartScreen({ navigation }: CartScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { items, loading, error, itemCount, removeItem, updateQuantity, clear } = useCart();
  const { marketplaceProducts } = useProducts();
  const [validation, setValidation] = useState<CartValidationResult | null>(null);
  const [validationLoading, setValidationLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const knownListings = useMemo<Record<string, CartKnownListing>>(() => Object.fromEntries(marketplaceProducts.map((product) => [product.id, {
    listingId: product.id,
    sellerId: product.sellerId,
    price: product.price,
    acceptsGemn: product.acceptsGemn,
    gemnValue: product.gemnValue,
    sellerAcceptsGemn: product.sellerAcceptsGemn,
  }])), [marketplaceProducts]);

  const validateCurrentCart = useCallback(async () => {
    if (loading || items.length === 0) {
      setValidation(null);
      setValidationError(null);
      return;
    }
    setValidationLoading(true);
    setValidationError(null);
    try {
      setValidation(await validateCart(items, knownListings));
    } catch (caughtError) {
      setValidationError(caughtError instanceof CartValidationError ? caughtError.message : 'Não foi possível atualizar os anúncios do carrinho.');
    } finally {
      setValidationLoading(false);
    }
  }, [items, knownListings, loading]);

  useEffect(() => { void validateCurrentCart(); }, [validateCurrentCart]);

  const validationByListingId = useMemo(() => new Map((validation?.items ?? []).map((item) => [item.cartItem.listingId, item])), [validation]);

  const resolvedItems = useMemo<ResolvedCartItem[]>(() => items.map((item) => ({
    cartId: item.listingId,
    product: marketplaceProducts.find((product) => product.id === item.listingId) ?? null,
    sellerId: item.sellerId,
    quantity: item.quantity,
    validationItem: validationByListingId.get(item.listingId),
  })), [items, marketplaceProducts, validationByListingId]);

  const groups = useMemo(() => {
    const grouped = new Map<string, ResolvedCartItem[]>();
    for (const item of resolvedItems) grouped.set(item.sellerId, [...(grouped.get(item.sellerId) ?? []), item]);
    return [...grouped.entries()].map(([sellerId, groupItems]) => ({ sellerId, items: groupItems }));
  }, [resolvedItems]);

  const estimatedTotal = validation?.estimatedTotal ?? resolvedItems.reduce((sum, item) => sum + (item.product?.price ?? 0) * item.quantity, 0);
  const unavailableCount = validation?.invalidItems.filter((item) => item.issues.includes('unavailable_listing')).length ?? resolvedItems.filter((item) => !item.product).length;

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={[styles.content, wide && styles.contentWide]}>
      <AppHeader title="Carrinho" subtitle={`${itemCount} ${itemCount === 1 ? 'unidade' : 'unidades'} selecionada${itemCount === 1 ? '' : 's'}`} onBack={() => navigation.goBack()} />
      {error ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text></AppCard> : null}
      {validationError ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{validationError}</Text><AppButton title="Tentar novamente" size="compact" variant="outline" onPress={() => { void validateCurrentCart(); }} /></AppCard> : null}
      {loading ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="cart-outline" size={30} color={colors.brand} /><Text style={styles.feedbackText}>Carregando seu carrinho...</Text></AppCard> : items.length === 0 ? (
        <AppCard style={styles.emptyCard}>
          <View style={styles.emptyIcon}><MaterialCommunityIcons name="cart-outline" size={34} color={colors.primary} /></View>
          <Text style={styles.emptyTitle}>Seu carrinho está vazio</Text>
          <Text style={styles.feedbackText}>Adicione produtos e serviços do marketplace para vê-los aqui.</Text>
          <AppButton title="Voltar ao marketplace" variant="outline" onPress={navigation.goBack} />
        </AppCard>
      ) : (
        <>
          {groups.map((group) => <View key={group.sellerId} style={styles.sellerGroup}>
            <View style={styles.sellerHeading}><MaterialCommunityIcons name="store-outline" size={20} color={colors.brand} /><Text style={styles.sellerName}>{group.items.find((item) => item.product?.sellerName)?.product?.sellerName ?? 'Vendedor'}</Text></View>
            {group.items.map((item) => <CartRow key={item.cartId} item={item} onRemove={() => removeItem(item.cartId)} onQuantityChange={(quantity) => updateQuantity(item.cartId, quantity)} />)}
          </View>)}

          {validationLoading ? <View style={styles.validationState}><MaterialCommunityIcons name="refresh" size={18} color={colors.brand} /><Text style={styles.feedbackText}>Atualizando disponibilidade e preços...</Text></View> : null}
          {validation?.sellerSubtotals.map((seller) => <View key={seller.sellerId} style={styles.sellerSubtotal}><Text style={styles.sellerSubtotalLabel}>{seller.sellerName} · {seller.itemCount} {seller.itemCount === 1 ? 'unidade' : 'unidades'}</Text><Text style={styles.sellerSubtotalValue}>{formatPrice(seller.subtotal)}</Text></View>)}
          {unavailableCount > 0 ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="information-outline" size={20} color={colors.warning} /><Text style={styles.warningText}>Alguns anúncios não estão disponíveis no marketplace atual. Eles não entram no total estimado.</Text></AppCard> : null}
          {validation?.detectedChanges.length ? <AppCard style={styles.warningCard}><MaterialCommunityIcons name="tag-edit-outline" size={20} color={colors.warning} /><Text style={styles.warningText}>Há alterações de preço ou nas regras GEMN. Revise os itens antes do checkout.</Text></AppCard> : null}

          <AppCard style={styles.summaryCard}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total estimado</Text><Text style={styles.totalValue}>{formatPrice(estimatedTotal)}</Text></View>
            <Text style={styles.summaryNote}>O preço final, a disponibilidade e as regras de pagamento serão validados novamente no checkout. O cashback será recalculado pelo servidor.</Text>
            <AppButton title="Finalizar compra" fullWidth disabled onPress={() => undefined} />
            <Text style={styles.disabledNote}>Checkout do carrinho disponível na próxima etapa.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Limpar carrinho" onPress={clear} style={styles.clearButton}><Text style={styles.clearText}>Limpar carrinho</Text></Pressable>
          </AppCard>
        </>
      )}
    </AppScreen>
  );
}

function CartRow({ item, onRemove, onQuantityChange }: { item: ResolvedCartItem; onRemove: () => void; onQuantityChange: (quantity: number) => void }) {
  const product = item.product;
  const currentListing = item.validationItem?.currentListing;
  const subtotal = item.validationItem?.estimatedSubtotal ?? (product ? product.price * item.quantity : 0);
  const issues = item.validationItem?.issues ?? (!product ? ['unavailable_listing' as const] : []);
  const hasReviewIssue = issues.length > 0;
  const issueText = issues.includes('price_changed') ? 'Preço alterado; revise antes do checkout.' : issues.includes('gemn_rules_changed') ? 'Regras GEMN alteradas; serão revalidadas pelo servidor.' : issues.includes('invalid_quantity') ? 'Quantidade inválida.' : !product ? 'Anúncio indisponível.' : null;
  return <AppCard style={[styles.itemCard, !product && styles.itemCardUnavailable]}>
    <View style={styles.itemMain}><ProductImage product={product} /><View style={styles.itemCopy}><Text style={styles.itemName}>{currentListing?.name ?? product?.name ?? 'Anúncio indisponível'}</Text><Text style={styles.itemPrice}>{currentListing ? `${formatPrice(currentListing.price)} por unidade` : product ? `${formatPrice(product.price)} por unidade` : 'Remova este item para continuar'}</Text>{subtotal > 0 ? <Text style={styles.itemSubtotal}>{formatPrice(subtotal)}</Text> : null}{hasReviewIssue && issueText ? <Text style={styles.itemIssue}>{issueText}</Text> : null}</View><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Remover ${product?.name ?? 'item'} do carrinho`} onPress={onRemove} style={styles.removeButton}><MaterialCommunityIcons name="trash-can-outline" size={20} color={colors.error} /></TouchableOpacity></View>
    <View style={styles.itemFooter}><View style={styles.quantityContainer}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Diminuir quantidade" onPress={() => onQuantityChange(item.quantity - 1)} style={styles.quantityButton}><MaterialCommunityIcons name="minus" size={18} color={colors.primary} /></TouchableOpacity><Text style={styles.quantityText}>{item.quantity}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel="Aumentar quantidade" onPress={() => onQuantityChange(item.quantity + 1)} style={styles.quantityButton}><MaterialCommunityIcons name="plus" size={18} color={colors.primary} /></TouchableOpacity></View><Text style={styles.quantityLabel}>Quantidade</Text></View>
  </AppCard>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.md },
  contentWide: { maxWidth: 920, alignSelf: 'center', width: '100%' },
  sellerGroup: { gap: spacing.sm },
  sellerHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs },
  sellerName: { ...typography.heading3, color: colors.brandDark },
  itemCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  itemCardUnavailable: { borderColor: colors.warning },
  itemMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  productImage: { width: 72, height: 72, borderRadius: radius.md, resizeMode: 'cover' },
  productPlaceholder: { width: 72, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  itemCopy: { flex: 1, minWidth: 0, gap: 3 },
  itemName: { ...typography.heading4, color: colors.text },
  itemPrice: { ...typography.caption, color: colors.textSecondary },
  itemSubtotal: { ...typography.label, color: colors.brandDark, marginTop: spacing.xs },
  removeButton: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  itemFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: spacing.sm },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xxs },
  quantityButton: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  quantityText: { width: 36, textAlign: 'center', ...typography.label, color: colors.text },
  quantityLabel: { ...typography.caption, color: colors.textSecondary },
  summaryCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.brandLight },
  summaryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { ...typography.heading3, color: colors.text },
  totalValue: { ...typography.heading2, color: colors.brandDark },
  summaryNote: { ...typography.caption, color: colors.textSecondary },
  disabledNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  clearButton: { alignSelf: 'center', minHeight: 36, justifyContent: 'center', paddingHorizontal: spacing.sm },
  clearText: { ...typography.caption, color: colors.error, fontWeight: '700' },
  emptyCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  emptyIcon: { width: 72, height: 72, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  emptyTitle: { ...typography.heading2, color: colors.brandDark, textAlign: 'center' },
  feedbackCard: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  errorCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.error },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  warningCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gemnLight, borderWidth: 1, borderColor: colors.gemnLight },
  warningText: { ...typography.caption, color: colors.warning, flex: 1 },
  validationState: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.xs },
  sellerSubtotal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingHorizontal: spacing.xs },
  sellerSubtotalLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  sellerSubtotalValue: { ...typography.label, color: colors.brandDark },
  itemIssue: { ...typography.caption, color: colors.warning, marginTop: spacing.xs },
});
