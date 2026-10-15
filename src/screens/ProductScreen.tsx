import React, { useEffect, useRef, useState } from 'react';
import { Image, PanResponder, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { getGemnPresentationEligibility } from '../services/gemnPresentation';
import { OrderServiceError, createOrder } from '../services/orders';
import { getSellerBranding } from '../services/sellerBranding';
import { useAuth } from '../context/AuthContext';
import type { GemnProduct } from '../context/ProductsContext';
import type { OrderRpcResult } from '../types/orders';
import type { SellerBrandingStore } from '../types/sellerBranding';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type ProductStackParamList = {
  Product: { listing: GemnProduct; listingSequence?: GemnProduct[]; listingIndex?: number };
  OrderConfirmation: OrderConfirmationParams;
  SellerStorefront: { sellerId: string };
};

export type OrderConfirmationParams = OrderRpcResult & {
  itemName: string;
};

type ProductScreenProps = {
  route: { params?: { listing?: GemnProduct; listingSequence?: GemnProduct[]; listingIndex?: number } };
  navigation: NativeStackNavigationProp<ProductStackParamList, 'Product'>;
};

function createSecureUuid() {
  return Crypto.randomUUID();
}

function purchaseErrorMessage(error: unknown) {
  if (error instanceof OrderServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível registrar o pedido. Tente novamente.';
}

function SellerCard({ storeName, logoUrl, onPress, disabled }: { storeName: string; logoUrl?: string; onPress: () => void; disabled: boolean }) {
  const [logoFailed, setLogoFailed] = useState(false);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Conhecer a loja ${storeName}`}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.sellerCard, pressed && !disabled && styles.sellerCardPressed]}
    >
      <View style={styles.sellerLogo}>
        {logoUrl && !logoFailed ? (
          <Image accessibilityLabel={`Logotipo de ${storeName}`} source={{ uri: logoUrl }} style={styles.sellerLogoImage} onError={() => setLogoFailed(true)} />
        ) : (
          <MaterialCommunityIcons name="store-outline" size={28} color={colors.brand} />
        )}
      </View>
      <View style={styles.sellerCardCopy}>
        <Text style={styles.sellerCardName} numberOfLines={1}>{storeName}</Text>
        <View style={styles.sellerApproved}>
          <MaterialCommunityIcons name="check-decagram" size={14} color={colors.success} />
          <Text style={styles.sellerApprovedText}>Vendedor aprovado</Text>
        </View>
      </View>
      <View style={styles.sellerVisit}>
        <Text style={styles.sellerVisitText}>Conhecer a loja</Text>
        <MaterialCommunityIcons name="arrow-right" size={17} color={colors.primary} />
      </View>
    </Pressable>
  );
}

export default function ProductScreen({ route, navigation }: ProductScreenProps) {
  const { width } = useWindowDimensions();
  const { user } = useAuth();
  const wide = width >= layout.breakpoints.tablet;
  const productImageHeight = Math.min(300, Math.max(220, Math.round(width * 0.66)));
  const listing = route?.params?.listing;
  const listingSequence = route?.params?.listingSequence ?? [];
  const listingIndex = route?.params?.listingIndex ?? listingSequence.findIndex((item) => item.id === listing?.id);
  const hasProductSequence = listingSequence.length > 1 && listingIndex >= 0;
  const [quantity, setQuantity] = useState(1);
  const [gemnInput, setGemnInput] = useState('0');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sellerBranding, setSellerBranding] = useState<SellerBrandingStore | null>(null);
  const intentRef = useRef<{ signature: string; key: string } | null>(null);
  const name = listing?.name ?? 'Anúncio indisponível';
  const numericPrice = listing?.price ?? 0;
  const price = numericPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const icon = listing?.icon ?? 'package-variant-closed';
  const total = numericPrice * quantity;
  const formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const gemnEligibility = getGemnPresentationEligibility({ sellerAcceptsGemn: listing?.sellerAcceptsGemn, listingAcceptsGemn: listing?.acceptsGemn, gemnValue: listing?.gemnValue });
  const parsedGemnInput = gemnEligibility.enabled ? Number(gemnInput.replace(',', '.')) : 0;
  const gemnUtilizado = Number.isFinite(parsedGemnInput) ? Math.min(total, Math.max(0, Math.round(parsedGemnInput * 100) / 100)) : 0;
  const paymentMethod = gemnUtilizado === 0 ? 'real' : gemnUtilizado === total ? 'gemn' : 'misto';

  function openAdjacentProduct(direction: -1 | 1) {
    if (!hasProductSequence) return;
    const nextIndex = listingIndex + direction;
    const nextListing = listingSequence[nextIndex];
    if (!nextListing) return;
    navigation.replace('Product', { listing: nextListing, listingSequence, listingIndex: nextIndex });
  }

  const productPanResponder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gestureState) => hasProductSequence && Math.abs(gestureState.dx) > 18 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25,
    onPanResponderRelease: (_event, gestureState) => {
      if (Math.abs(gestureState.dx) < 64 || Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) return;
      openAdjacentProduct(gestureState.dx < 0 ? 1 : -1);
    },
  }), [hasProductSequence, listingIndex, listingSequence]);

  useEffect(() => {
    if (!listing || isSubmitting) return;
    intentRef.current = null;
    setErrorMessage(null);
  }, [listing?.id, quantity, gemnInput]);

  useEffect(() => {
    setQuantity(1);
    setGemnInput('0');
    intentRef.current = null;
    setErrorMessage(null);
  }, [listing?.id]);

  useEffect(() => {
    let mounted = true;
    setSellerBranding(null);
    if (!listing?.sellerId) return () => { mounted = false; };

    void getSellerBranding(listing.sellerId)
      .then((store) => {
        if (mounted) setSellerBranding(store);
      })
      .catch(() => {
        // O cartão continua utilizável com os dados do anúncio se o branding não estiver disponível.
      });

    return () => { mounted = false; };
  }, [listing?.sellerId]);

  async function handleConfirmPurchase() {
    if (isSubmitting) return;
    if (!user) {
      setErrorMessage('Entre na sua conta para registrar um pedido.');
      return;
    }
    if (!listing) {
      setErrorMessage('Este anúncio não está disponível.');
      return;
    }

    const signature = `${listing.id}:${quantity}:${gemnUtilizado}`;
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      if (!intentRef.current || intentRef.current.signature !== signature) {
        intentRef.current = { signature, key: createSecureUuid() };
      }
      const idempotencyKey = intentRef.current?.key;
      if (!idempotencyKey) throw new Error('Não foi possível preparar a chave do pedido.');
      const result = await createOrder({
        listingId: listing.id,
        quantidade: quantity,
        formaPagamento: paymentMethod,
        gemnUtilizado,
        idempotencyKey,
      });
      // push força a confirmação no stack atual (MarketplaceStack ou HomeStack).
      // A navegação só ocorre depois do retorno validado da RPC.
      navigation.push('OrderConfirmation', { ...result, itemName: listing.name });
    } catch (error) {
      setErrorMessage(purchaseErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Voltar" onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={26} color={colors.text} />
        </Pressable>
        <Text style={styles.topBarTitle}>Detalhes do produto</Text>
        <View style={styles.topBarSpacer} />
      </View>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.detailsColumn, wide && styles.detailsColumnWide]} {...productPanResponder.panHandlers}>
          <AppCard padding={0} style={[styles.productCard, wide && styles.productCardWide]}>
            <View style={[styles.productVisual, !wide && { height: productImageHeight }, wide && styles.productVisualWide]}>
              {listing?.imageUrl ? <Image source={{ uri: listing.imageUrl }} style={styles.productImage} /> : <View style={styles.iconDisc}><MaterialCommunityIcons name={icon} size={wide ? 72 : 60} color={colors.primary} /></View>}
              <AppBadge label={listing?.category ?? 'ANÚNCIO DA COMUNIDADE'} variant="neutral" />
            </View>
            <View style={styles.productCopy}>
              <Text style={styles.productName}>{name}</Text>
              <SellerCard
                storeName={sellerBranding?.storeName ?? listing?.sellerName ?? 'Comunidade Mundo Novo'}
                logoUrl={sellerBranding?.branding.logoUrl}
                disabled={!listing?.sellerId}
                onPress={() => { if (listing?.sellerId) navigation.navigate('SellerStorefront', { sellerId: listing.sellerId }); }}
              />
              <View style={styles.priceRow}><Text style={styles.price}>{price}</Text></View>
              {gemnEligibility.enabled ? <View style={styles.gemnLine}><MaterialCommunityIcons name="star-four-points" size={15} color={colors.gemn} /><Text style={styles.gemnText}>Aceita Moeda GEMN · {gemnEligibility.value} GEMN por unidade</Text></View> : <View style={styles.gemnLine}><MaterialCommunityIcons name="information-outline" size={15} color={colors.textSecondary} /><Text style={styles.gemnMutedText}>Pagamento somente em reais</Text></View>}
            </View>
          </AppCard>

          {hasProductSequence ? <View style={[styles.productNavigation, wide && styles.productNavigationWide]}>
            {wide ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Produto anterior" disabled={listingIndex <= 0} onPress={() => openAdjacentProduct(-1)} style={[styles.productNavigationButton, listingIndex <= 0 && styles.productNavigationButtonDisabled]}><MaterialCommunityIcons name="chevron-left" size={20} color={listingIndex <= 0 ? colors.textMuted : colors.primary} /><Text style={styles.productNavigationButtonText}>Anterior</Text></TouchableOpacity> : null}
            <Text style={styles.productPosition}>{listingIndex + 1} de {listingSequence.length}</Text>
            {wide ? <TouchableOpacity accessibilityRole="button" accessibilityLabel="Próximo produto" disabled={listingIndex >= listingSequence.length - 1} onPress={() => openAdjacentProduct(1)} style={[styles.productNavigationButton, listingIndex >= listingSequence.length - 1 && styles.productNavigationButtonDisabled]}><Text style={styles.productNavigationButtonText}>Próximo</Text><MaterialCommunityIcons name="chevron-right" size={20} color={listingIndex >= listingSequence.length - 1 ? colors.textMuted : colors.primary} /></TouchableOpacity> : null}
          </View> : null}

          <View style={styles.aboutSection}>
            <Text style={styles.sectionTitle}>Sobre o produto</Text>
              <Text style={styles.description}>{listing?.description ?? 'O anúncio não está disponível para compra.'}</Text>
          </View>
        </View>

        <AppCard elevated={wide} style={[styles.purchaseCard, wide && styles.purchaseCardWide]}>
          <Text style={styles.purchaseTitle}>Sua compra</Text>
          <Text style={styles.sectionTitle}>Quantidade</Text>
          <View style={styles.quantityContainer}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Diminuir quantidade" hitSlop={4} style={styles.quantityButton} onPress={() => setQuantity((current) => Math.max(1, current - 1))}><MaterialCommunityIcons name="minus" size={22} color={colors.primary} /></TouchableOpacity>
            <Text style={styles.quantityText}>{quantity}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel="Aumentar quantidade" hitSlop={4} style={styles.quantityButton} onPress={() => setQuantity((current) => current + 1)}><MaterialCommunityIcons name="plus" size={22} color={colors.primary} /></TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Forma de pagamento</Text>
          <View style={styles.paymentOptions}>
            <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === 'real' }} style={[styles.paymentOption, paymentMethod === 'real' && styles.paymentOptionActive]} onPress={() => setGemnInput('0')}>
              <MaterialCommunityIcons name="cash" size={23} color={paymentMethod === 'real' ? colors.primary : colors.textSecondary} /><Text style={styles.paymentTitle}>Reais</Text><Text style={styles.paymentAmount}>{formattedTotal}</Text>{paymentMethod === 'real' ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>
            {gemnEligibility.enabled ? <View style={styles.gemnPaymentBox}>
              <View style={styles.gemnPaymentHeader}><MaterialCommunityIcons name="star-four-points" size={21} color={colors.gemn} /><Text style={styles.paymentTitle}>Usar GEMN</Text><Text style={styles.paymentAmount}>{gemnUtilizado.toFixed(2)} GEMN</Text></View>
              <TextInput accessibilityLabel="Quantidade de GEMN utilizada" keyboardType="decimal-pad" value={gemnInput} onChangeText={setGemnInput} style={styles.gemnInput} placeholder="0,00" />
              <TouchableOpacity accessibilityRole="button" onPress={() => setGemnInput(total.toFixed(2))}><Text style={styles.gemnMax}>Usar 100% em GEMN</Text></TouchableOpacity>
            </View> : null}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Quantidade</Text><Text style={styles.summaryValue}>{quantity}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Pagamento</Text><Text style={styles.summaryValue}>{paymentMethod === 'real' ? 'Reais' : paymentMethod === 'gemn' ? '100% GEMN' : 'Misto'}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>GEMN utilizado</Text><Text style={styles.summaryValue}>{gemnUtilizado.toFixed(2)} GEMN</Text></View>
            <View style={styles.divider} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Devido em reais</Text><Text style={styles.totalValue}>{(total - gemnUtilizado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</Text></View>
          </View>
          {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
          <Text style={styles.paymentNote}>A forma escolhida registra apenas sua intenção de pagamento. Nenhum pagamento ou débito GEMN é realizado nesta etapa.</Text>
          <AppButton title="Registrar pedido" fullWidth onPress={() => { void handleConfirmPurchase(); }} loading={isSubmitting} disabled={!listing} style={styles.confirmButton} />
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.background },
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  topBar: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backButton: { width: 40, height: 40, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
  topBarTitle: { ...typography.heading4, color: colors.text },
  topBarSpacer: { width: 40, height: 40 },
  layout: { gap: spacing.md },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  detailsColumn: { gap: spacing.md },
  detailsColumnWide: { flex: 1, minWidth: 0 },
  productCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, ...shadows.subtle },
  productCardWide: { flexDirection: 'row' },
  productNavigation: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  productNavigationWide: { justifyContent: 'space-between' },
  productNavigationButton: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  productNavigationButtonDisabled: { opacity: 0.55 },
  productNavigationButtonText: { ...typography.caption, color: colors.primary, fontWeight: '700' },
  productPosition: { ...typography.caption, color: colors.textMuted },
  productVisual: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.md, position: 'relative' },
  productVisualWide: { width: '42%', minHeight: 300 },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  iconDisc: { width: 116, height: 116, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.subtle },
  productCopy: { flex: 1, padding: spacing.md, gap: spacing.sm },
  productName: { ...typography.heading1, color: colors.brandDark },
  sellerCard: { minHeight: 84, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  sellerCardPressed: { opacity: 0.82, backgroundColor: colors.brandLight },
  sellerLogo: { width: 72, height: 72, borderRadius: radius.md, padding: spacing.xs, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  sellerLogoImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  sellerCardCopy: { flex: 1, minWidth: 0, gap: 2 },
  sellerCardName: { ...typography.heading4, color: colors.text },
  sellerApproved: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  sellerApprovedText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  sellerVisit: { flexDirection: 'row', alignItems: 'center', gap: 3, flexShrink: 0 },
  sellerVisitText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  price: { ...typography.heading1, color: colors.brandDark },
  gemnLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  gemnText: { ...typography.caption, color: colors.brand, fontWeight: '600' },
  gemnMutedText: { ...typography.caption, color: colors.textSecondary },
  aboutSection: { gap: spacing.sm },
  sectionTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.xs, marginBottom: spacing.xs },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  purchaseCard: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, gap: spacing.sm, backgroundColor: colors.surface, ...shadows.subtle },
  purchaseCardWide: { width: 368, flexShrink: 0 },
  purchaseTitle: { ...typography.heading2, color: colors.text, marginBottom: spacing.xs },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs },
  quantityButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  quantityText: { width: 52, textAlign: 'center', ...typography.heading3, color: colors.text },
  paymentOptions: { gap: spacing.sm },
  paymentOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  paymentOptionActive: { borderColor: colors.brand, backgroundColor: colors.brandLight },
  paymentOptionGemnActive: { borderColor: colors.gemn, backgroundColor: colors.gemnLight },
  gemnPaymentBox: { borderWidth: 1, borderColor: colors.gemn, borderRadius: radius.md, padding: spacing.sm, gap: spacing.xs, backgroundColor: colors.gemnLight },
  gemnPaymentHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  gemnInput: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, color: colors.text },
  gemnMax: { color: colors.warning, fontWeight: '700', fontSize: 12 },
  paymentTitle: { ...typography.label, color: colors.text },
  paymentAmount: { flex: 1, textAlign: 'right', ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  summary: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { ...typography.heading3, color: colors.text },
  totalValue: { ...typography.heading2, color: colors.brandDark },
  confirmButton: { width: '100%', marginTop: spacing.sm, backgroundColor: colors.brand },
  error: { ...typography.bodySmall, color: colors.error },
  paymentNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
});
