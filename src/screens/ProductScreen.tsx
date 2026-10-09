import React, { useState } from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

export default function ProductScreen({ route, navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const productImageHeight = Math.min(320, Math.max(240, Math.round(width * 0.72)));
  const listing = route?.params?.listing;
  const name = listing?.name ?? route?.params?.name ?? 'Produto Exemplo';
  const numericPrice = listing?.price ?? (Number(String(route?.params?.price ?? '50').replace('R$', '').replace(/\./g, '').replace(',', '.')) || 50);
  const price = numericPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const icon = listing?.icon ?? route?.params?.icon ?? 'package-variant-closed';
  const [quantity, setQuantity] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<'money' | 'gemn'>('money');
  const total = numericPrice * quantity;
  const formattedTotal = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const gemnUnitValue = Number(listing?.gemnValue ?? 10);
  const gemnTotal = quantity * gemnUnitValue;

  function handleConfirmPurchase() {
    navigation.navigate('OrderConfirmation', { name, quantity, paymentMethod, total: paymentMethod === 'money' ? formattedTotal : `${gemnTotal} GEMN` });
  }

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.layout, wide && styles.layoutWide]}>
        <View style={[styles.detailsColumn, wide && styles.detailsColumnWide]}>
          <AppCard padding={0} style={[styles.productCard, wide && styles.productCardWide]}>
            <View style={[styles.productVisual, !wide && { height: productImageHeight }, wide && styles.productVisualWide]}>
              {listing?.imageUrl ? <Image source={{ uri: listing.imageUrl }} style={styles.productImage} /> : <View style={styles.iconDisc}><MaterialCommunityIcons name={icon} size={wide ? 72 : 60} color={colors.primary} /></View>}
              <AppBadge label={listing?.category ?? 'ANÚNCIO DA COMUNIDADE'} variant="neutral" />
            </View>
            <View style={styles.productCopy}>
              <Text style={styles.productName}>{name}</Text>
              <View style={styles.sellerLine}><MaterialCommunityIcons name="store-outline" size={16} color={colors.textSecondary} /><Text style={styles.sellerName}>{listing?.sellerName ?? 'Comunidade Mundo Novo'}</Text><View style={styles.verified}><MaterialCommunityIcons name="check-decagram" size={15} color={colors.success} /><Text style={styles.verifiedText}>Vendedor aprovado</Text></View></View>
              <View style={styles.priceRow}><Text style={styles.price}>{price}</Text></View>
              {listing?.acceptsGemn !== false ? <View style={styles.gemnLine}><MaterialCommunityIcons name="star-four-points" size={15} color={colors.secondary} /><Text style={styles.gemnText}>Aceita Moeda GEMN · {gemnUnitValue} GEMN por unidade</Text></View> : <View style={styles.gemnLine}><MaterialCommunityIcons name="information-outline" size={15} color={colors.textSecondary} /><Text style={styles.gemnMutedText}>Pagamento somente em reais</Text></View>}
            </View>
          </AppCard>

          <View style={styles.aboutSection}>
            <Text style={styles.sectionTitle}>Sobre o produto</Text>
            <Text style={styles.description}>{listing?.description ?? 'Confira os detalhes deste anúncio da comunidade GEMN.'}</Text>
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
            <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === 'money' }} style={[styles.paymentOption, paymentMethod === 'money' && styles.paymentOptionActive]} onPress={() => setPaymentMethod('money')}>
              <MaterialCommunityIcons name="cash" size={23} color={paymentMethod === 'money' ? colors.primary : colors.textSecondary} /><Text style={styles.paymentTitle}>Reais</Text><Text style={styles.paymentAmount}>{formattedTotal}</Text>{paymentMethod === 'money' ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.primary} /> : null}
            </TouchableOpacity>
            {listing?.acceptsGemn !== false ? <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: paymentMethod === 'gemn' }} style={[styles.paymentOption, paymentMethod === 'gemn' && styles.paymentOptionGemnActive]} onPress={() => setPaymentMethod('gemn')}>
              <MaterialCommunityIcons name="star-four-points" size={21} color={paymentMethod === 'gemn' ? colors.secondary : colors.textSecondary} /><Text style={styles.paymentTitle}>GEMN</Text><Text style={styles.paymentAmount}>{gemnTotal} GEMN</Text>{paymentMethod === 'gemn' ? <MaterialCommunityIcons name="check-circle" size={20} color={colors.secondary} /> : null}
            </TouchableOpacity> : null}
          </View>

          <View style={styles.summary}>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Quantidade</Text><Text style={styles.summaryValue}>{quantity}</Text></View>
            <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Pagamento</Text><Text style={styles.summaryValue}>{paymentMethod === 'money' ? 'Reais' : 'GEMN'}</Text></View>
            <View style={styles.divider} />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Total</Text><Text style={styles.totalValue}>{paymentMethod === 'money' ? formattedTotal : `${gemnTotal} GEMN`}</Text></View>
          </View>
          <AppButton title="Confirmar compra" fullWidth onPress={handleConfirmPurchase} style={styles.confirmButton} />
        </AppCard>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.sm, paddingBottom: spacing.xxl, gap: spacing.lg },
  layout: { gap: spacing.lg },
  layoutWide: { flexDirection: 'row', alignItems: 'flex-start' },
  detailsColumn: { gap: spacing.lg },
  detailsColumnWide: { flex: 1, minWidth: 0 },
  productCard: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  productCardWide: { flexDirection: 'row' },
  productVisual: { backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: spacing.md, position: 'relative' },
  productVisualWide: { width: '42%', minHeight: 300 },
  productImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  iconDisc: { width: 116, height: 116, borderRadius: radius.full, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', ...shadows.subtle },
  productCopy: { flex: 1, padding: spacing.lg, gap: spacing.sm },
  productName: { ...typography.heading1, color: colors.text },
  sellerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  sellerName: { ...typography.bodySmall, color: colors.textSecondary },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: spacing.xs },
  verifiedText: { ...typography.caption, color: colors.success },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  price: { ...typography.heading2, color: colors.secondary },
  gemnLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
  gemnText: { ...typography.caption, color: colors.secondary, fontWeight: '600' },
  gemnMutedText: { ...typography.caption, color: colors.textSecondary },
  aboutSection: { gap: spacing.sm },
  sectionTitle: { ...typography.heading3, color: colors.text, marginTop: spacing.xs, marginBottom: spacing.xs },
  description: { ...typography.bodySmall, color: colors.textSecondary },
  purchaseCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm },
  purchaseCardWide: { width: 368, flexShrink: 0 },
  purchaseTitle: { ...typography.heading2, color: colors.text, marginBottom: spacing.xs },
  quantityContainer: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: spacing.xs },
  quantityButton: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  quantityText: { width: 52, textAlign: 'center', ...typography.heading3, color: colors.text },
  paymentOptions: { gap: spacing.sm },
  paymentOption: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  paymentOptionActive: { borderColor: colors.primary, backgroundColor: colors.primaryLight },
  paymentOptionGemnActive: { borderColor: colors.secondary, backgroundColor: colors.secondaryLight },
  paymentTitle: { ...typography.label, color: colors.text },
  paymentAmount: { flex: 1, textAlign: 'right', ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  summary: { marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary },
  summaryValue: { ...typography.bodySmall, color: colors.text, fontWeight: '600' },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { ...typography.heading3, color: colors.text },
  totalValue: { ...typography.heading2, color: colors.primary },
  confirmButton: { width: '100%', marginTop: spacing.sm },
});
