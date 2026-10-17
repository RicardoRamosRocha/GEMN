import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppButton, AppCard, AppHeader, AppScreen } from '../components/ui';
import { useCart } from '../context/CartContext';
import { useProducts, type GemnProduct } from '../context/ProductsContext';
import { CartValidationError, createCheckoutIntent, validateCart } from '../services/cartValidation';
import { CartCheckoutError, createOrderFromItems, getAvailableGemnBalance } from '../services/cartCheckout';
import type { CartCheckoutIntent, CartCheckoutOrderResult, CartKnownListing, CartValidationItem, CartValidationResult } from '../types/cart';
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

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function changeSignature(result: CartValidationResult | null) {
  return (result?.items ?? []).flatMap((item) => item.changes.map((change) => `${item.cartItem.listingId}:${change.code}:${String(change.previousValue ?? null)}:${String(change.currentValue ?? null)}`)).sort().join('|');
}

function hasBlockingIssue(item: CartValidationItem) {
  return item.issues.some((issue) => issue !== 'price_changed' && issue !== 'gemn_rules_changed');
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
  const [availableGemn, setAvailableGemn] = useState(0);
  const [gemnInputs, setGemnInputs] = useState<Record<string, string>>({});
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [checkoutResults, setCheckoutResults] = useState<CartCheckoutOrderResult[]>([]);
  const [acceptedChangeSignature, setAcceptedChangeSignature] = useState<string | null>(null);
  const checkoutIntentRef = useRef<{ intent: CartCheckoutIntent; signatures: Record<string, string> } | null>(null);
  const checkoutSellerNamesRef = useRef<Record<string, string>>({});

  const knownListings = useMemo<Record<string, CartKnownListing>>(() => Object.fromEntries(marketplaceProducts.map((product) => [product.id, {
    listingId: product.id,
    sellerId: product.sellerId,
    price: product.price,
    acceptsGemn: product.acceptsGemn && product.sellerAcceptsGemn === true && product.gemnValue !== undefined,
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
      const [result, balance] = await Promise.all([validateCart(items, knownListings), getAvailableGemnBalance()]);
      setValidation(result);
      setAvailableGemn(balance);
    } catch (caughtError) {
      setValidationError(caughtError instanceof CartValidationError ? caughtError.message : 'Não foi possível atualizar os anúncios do carrinho.');
    } finally {
      setValidationLoading(false);
    }
  }, [items, knownListings, loading]);

  useEffect(() => { void validateCurrentCart(); }, [validateCurrentCart]);

  const currentChangeSignature = changeSignature(validation);
  const changesAccepted = currentChangeSignature.length === 0 || acceptedChangeSignature === currentChangeSignature;
  const blockingInvalidCount = validation?.invalidItems.filter(hasBlockingIssue).length ?? 0;

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

  const checkoutGroups = useMemo(() => {
    const grouped = new Map<string, { sellerId: string; sellerName: string; items: CartValidationItem[]; subtotal: number; gemnEligible: boolean }>();
    for (const item of validation?.validItems ?? []) {
      const listing = item.currentListing;
      if (!listing) continue;
      const group = grouped.get(listing.sellerId) ?? { sellerId: listing.sellerId, sellerName: listing.sellerName, items: [], subtotal: 0, gemnEligible: true };
      group.items.push(item);
      group.subtotal = roundMoney(group.subtotal + (item.estimatedSubtotal ?? 0));
      group.gemnEligible = group.gemnEligible && listing.acceptsGemn && listing.sellerAcceptsGemn && listing.gemnValue !== null;
      grouped.set(listing.sellerId, group);
    }
    return [...grouped.values()];
  }, [validation]);

  function getCheckoutIntent(itemsToUse: CartValidationItem[]) {
    const signatures = Object.fromEntries(itemsToUse.map((item) => [item.cartItem.listingId, `${item.cartItem.sellerId}:${item.cartItem.quantity}`]));
    const previous = checkoutIntentRef.current;
    const canReuse = previous && Object.entries(signatures).every(([listingId, signature]) => previous.signatures[listingId] === signature);
    if (canReuse && previous) return previous.intent;
    const intent = createCheckoutIntent(itemsToUse.map((item) => item.cartItem));
    checkoutIntentRef.current = { intent, signatures };
    return intent;
  }

  async function handleCheckout() {
    if (checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError(null);
    try {
      const latest = await validateCart(items, knownListings);
      setValidation(latest);
      const balance = await getAvailableGemnBalance();
      setAvailableGemn(balance);
      const latestSignature = changeSignature(latest);
      if (latest.invalidItems.some(hasBlockingIssue)) throw new CartCheckoutError('business', 'Revise os itens destacados antes de finalizar o carrinho.');
      if (latestSignature.length > 0 && acceptedChangeSignature !== latestSignature) throw new CartCheckoutError('business', 'Revise e aceite as alterações de preço ou regras GEMN antes de finalizar.');
      if (latest.validItems.length === 0) throw new CartCheckoutError('business', 'Não há itens válidos para finalizar.');

      const currentGroups = new Map<string, { sellerId: string; sellerName: string; items: CartValidationItem[]; subtotal: number; gemnEligible: boolean }>();
      for (const item of latest.validItems) {
        const listing = item.currentListing;
        if (!listing) continue;
        const group = currentGroups.get(listing.sellerId) ?? { sellerId: listing.sellerId, sellerName: listing.sellerName, items: [], subtotal: 0, gemnEligible: true };
        group.items.push(item);
        group.subtotal = roundMoney(group.subtotal + (item.estimatedSubtotal ?? 0));
        group.gemnEligible = group.gemnEligible && listing.acceptsGemn && listing.sellerAcceptsGemn && listing.gemnValue !== null;
        currentGroups.set(listing.sellerId, group);
      }
      const groupsToCheckout = [...currentGroups.values()];
      const requestedBySeller = groupsToCheckout.reduce<Record<string, number>>((result, group) => {
        if (!group.gemnEligible) {
          result[group.sellerId] = 0;
          return result;
        }
        const parsed = Number((gemnInputs[group.sellerId] ?? '0').replace(',', '.'));
        result[group.sellerId] = Number.isFinite(parsed) ? roundMoney(Math.max(0, parsed)) : -1;
        return result;
      }, {});
      if (Object.values(requestedBySeller).some((value) => value < 0)) throw new CartCheckoutError('business', 'Informe valores GEMN válidos para cada vendedor.');
      if (Object.values(requestedBySeller).reduce((sum, value) => sum + value, 0) > balance) throw new CartCheckoutError('business', 'O GEMN solicitado supera seu saldo disponível.');
      for (const group of groupsToCheckout) {
        const requested = requestedBySeller[group.sellerId];
        if (requested > group.subtotal) throw new CartCheckoutError('business', `O GEMN do vendedor ${group.sellerName} supera o subtotal do pedido.`);
        if (!group.gemnEligible && requested > 0) throw new CartCheckoutError('business', `${group.sellerName} possui itens que exigem pagamento em reais.`);
      }

      const intent = getCheckoutIntent(latest.validItems);
      const results: CartCheckoutOrderResult[] = [];
      for (const group of groupsToCheckout) {
        const sellerIntent = intent.sellers.find((seller) => seller.sellerId === group.sellerId);
        if (!sellerIntent) throw new CartCheckoutError('unexpected', 'Não foi possível preparar a tentativa deste vendedor.');
        checkoutSellerNamesRef.current[group.sellerId] = group.sellerName;
        const result = await createOrderFromItems({
          items: group.items.map((item) => ({ listingId: item.cartItem.listingId, quantity: item.cartItem.quantity })),
          gemnUsed: requestedBySeller[group.sellerId],
          idempotencyKey: sellerIntent.idempotencyKey,
        });
        results.push(result);
        setCheckoutResults([...results]);
        for (const item of group.items) removeItem(item.cartItem.listingId);
      }
      checkoutIntentRef.current = null;
    } catch (caughtError) {
      setCheckoutError(caughtError instanceof CartCheckoutError ? caughtError.message : 'Não foi possível concluir o carrinho. Os vendedores já concluídos não serão repetidos.');
    } finally {
      setCheckoutLoading(false);
    }
  }

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

          {validation?.detectedChanges.length ? <AppButton title={changesAccepted ? 'Alterações revisadas' : 'Aceitar alterações após revisar'} size="compact" variant="outline" disabled={changesAccepted || checkoutLoading} onPress={() => setAcceptedChangeSignature(currentChangeSignature)} /> : null}

          <AppCard style={styles.gemnCard}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Saldo GEMN disponível</Text><Text style={styles.gemnBalance}>{availableGemn.toFixed(2)} GEMN</Text></View>
            {checkoutGroups.map((group) => <View key={group.sellerId} style={styles.gemnSellerRow}>
              <View style={styles.gemnSellerCopy}><Text style={styles.gemnSellerName}>{group.sellerName}</Text><Text style={styles.gemnSellerNote}>{group.gemnEligible ? `Até ${formatPrice(group.subtotal)} neste pedido` : 'Pagamento em reais para estes itens'}</Text></View>
              {group.gemnEligible ? <TextInput accessibilityLabel={`GEMN para ${group.sellerName}`} keyboardType="decimal-pad" value={gemnInputs[group.sellerId] ?? '0'} onChangeText={(value) => setGemnInputs((current) => ({ ...current, [group.sellerId]: value }))} editable={!checkoutLoading} style={styles.gemnSellerInput} /> : null}
            </View>)}
            <Text style={styles.summaryNote}>O valor final será calculado e validado pela RPC no servidor. GEMN utilizado não gera cashback.</Text>
          </AppCard>

          {checkoutError ? <AppCard style={styles.errorCard}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{checkoutError}</Text></AppCard> : null}
          {checkoutResults.length > 0 ? <AppCard style={styles.successCard}><Text style={styles.successTitle}>Resultado por vendedor</Text>{checkoutResults.map((result) => <View key={result.orderId} style={styles.resultRow}><View style={styles.resultCopy}><Text style={styles.resultSeller}>{checkoutSellerNamesRef.current[result.sellerId] ?? 'Vendedor'}</Text><Text style={styles.resultNote}>Pedido criado · {result.gemnUsed.toFixed(2)} GEMN · cashback estimado {formatPrice(result.cashbackEstimated)}</Text></View><Text style={styles.resultValue}>{formatPrice(result.dueReal)}</Text></View>)}</AppCard> : null}

          <AppCard style={styles.summaryCard}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total estimado</Text><Text style={styles.totalValue}>{formatPrice(estimatedTotal)}</Text></View>
            <Text style={styles.summaryNote}>O preço final, a disponibilidade e as regras de pagamento serão validados novamente no checkout. O cashback será recalculado pelo servidor.</Text>
            <AppButton title={checkoutLoading ? 'Processando pedidos...' : 'Finalizar compra'} fullWidth loading={checkoutLoading} disabled={checkoutLoading || validationLoading || !validation || blockingInvalidCount > 0 || !changesAccepted || Boolean(validationError) || checkoutGroups.length === 0} onPress={() => { void handleCheckout(); }} />
            <Text style={styles.disabledNote}>Cada vendedor recebe um pedido separado. O pagamento em reais continua simulado nesta etapa.</Text>
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
  gemnCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.gemnLight, backgroundColor: colors.surface },
  gemnBalance: { ...typography.label, color: colors.gemn },
  gemnSellerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  gemnSellerCopy: { flex: 1, minWidth: 0, gap: 2 },
  gemnSellerName: { ...typography.label, color: colors.text },
  gemnSellerNote: { ...typography.caption, color: colors.textSecondary },
  gemnSellerInput: { width: 104, borderWidth: 1, borderColor: colors.gemn, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.text, textAlign: 'right' },
  successCard: { gap: spacing.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: colors.surface },
  successTitle: { ...typography.heading3, color: colors.brandDark },
  resultRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, paddingTop: spacing.xs, borderTopWidth: 1, borderTopColor: colors.border },
  resultCopy: { flex: 1, minWidth: 0, gap: 2 },
  resultSeller: { ...typography.label, color: colors.text },
  resultNote: { ...typography.caption, color: colors.textSecondary },
  resultValue: { ...typography.label, color: colors.brandDark },
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
