import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

export default function OrderConfirmationScreen({ route, navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const { name = 'Produto Exemplo', quantity = 1, paymentMethod = 'money', total = 'R$ 50,00' } = route?.params ?? {};

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.confirmation, wide && styles.confirmationWide]}>
        <View style={styles.hero}>
          <View style={styles.successIcon}>
            <MaterialCommunityIcons name="check" size={34} color={colors.white} />
          </View>
          <AppBadge label="COMPRA CONCLUÍDA" variant="success" />
          <Text style={styles.title}>Pedido confirmado!</Text>
          <Text style={styles.subtitle}>Sua compra foi registrada com sucesso.</Text>
        </View>

        <View style={styles.orderNumber}>
          <View>
            <Text style={styles.orderNumberLabel}>Número do pedido</Text>
            <Text style={styles.orderNumberValue}>#GEMN-0001</Text>
          </View>
          <MaterialCommunityIcons name="check-decagram-outline" size={28} color={colors.primary} />
        </View>

        <View style={[styles.details, wide && styles.detailsWide]}>
          <AppCard elevated={wide} style={styles.card}>
            <Text style={styles.cardTitle}>Resumo do pedido</Text>

            <View style={styles.productRow}>
              <View style={styles.productIcon}>
                <MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.primary} />
              </View>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{name}</Text>
                <Text style={styles.quantity}>Quantidade: {quantity}</Text>
              </View>
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.label}>Forma de pagamento</Text>
              <View style={styles.paymentValue}>
                <MaterialCommunityIcons
                  name={paymentMethod === 'money' ? 'cash' : 'star-four-points'}
                  size={16}
                  color={paymentMethod === 'money' ? colors.primary : colors.secondary}
                />
                <Text style={styles.value}>{paymentMethod === 'money' ? 'Reais' : 'Moeda GEMN'}</Text>
              </View>
            </View>

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.total}>{total}</Text>
            </View>
          </AppCard>

          <AppCard elevated={wide} style={[styles.card, styles.stepsCard]}>
            <Text style={styles.cardTitle}>Acompanhe seu pedido</Text>
            <View style={styles.step}>
              <View style={[styles.stepIcon, styles.stepIconActive]}>
                <MaterialCommunityIcons name="check" size={16} color={colors.white} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>Pedido recebido</Text>
                <Text style={styles.stepText}>Compra confirmada</Text>
              </View>
            </View>
            <View style={styles.step}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name="clock-outline" size={17} color={colors.secondary} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>Aguardando processamento</Text>
                <Text style={styles.stepText}>Em breve, novas atualizações</Text>
              </View>
            </View>
            <View style={styles.stepLast}>
              <View style={styles.stepIcon}>
                <MaterialCommunityIcons name="package-variant" size={17} color={colors.textSecondary} />
              </View>
              <View style={styles.stepCopy}>
                <Text style={styles.stepTitle}>Preparação do pedido</Text>
                <Text style={styles.stepText}>Será iniciado em seguida</Text>
              </View>
            </View>
          </AppCard>
        </View>

        <View style={styles.actions}>
          <AppButton title="Continuar comprando" onPress={() => navigation.navigate('Marketplace', { screen: 'MarketplaceHome' })} style={styles.primaryButton} />
          <AppButton title="Voltar" variant="outline" onPress={() => navigation.goBack()} style={styles.secondaryButton} />
        </View>
      </View>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl },
  confirmation: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: spacing.md },
  confirmationWide: { maxWidth: 840, gap: spacing.lg },
  hero: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  successIcon: { width: 72, height: 72, borderRadius: radius.full, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', ...shadows.floating },
  title: { ...typography.heading1, color: colors.text, textAlign: 'center', marginTop: spacing.xs },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  orderNumber: { minHeight: 76, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.lg, backgroundColor: colors.primaryLight, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  orderNumberLabel: { ...typography.caption, color: colors.textSecondary },
  orderNumberValue: { ...typography.heading3, color: colors.primary, marginTop: spacing.xs },
  details: { gap: spacing.md },
  detailsWide: { flexDirection: 'row', alignItems: 'stretch' },
  card: { flex: 1, borderWidth: 1, borderColor: colors.border },
  cardTitle: { ...typography.heading3, color: colors.text, marginBottom: spacing.md },
  productRow: { flexDirection: 'row', alignItems: 'center' },
  productIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, marginLeft: spacing.md },
  productName: { ...typography.label, color: colors.text },
  quantity: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  label: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  paymentValue: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  value: { ...typography.label, color: colors.text },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: spacing.md },
  totalLabel: { ...typography.heading3, color: colors.text },
  total: { ...typography.heading2, color: colors.primary },
  stepsCard: { minWidth: 0 },
  step: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md },
  stepLast: { flexDirection: 'row', alignItems: 'center' },
  stepIcon: { width: 30, height: 30, borderRadius: radius.full, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  stepIconActive: { backgroundColor: colors.success },
  stepCopy: { flex: 1, marginLeft: spacing.sm },
  stepTitle: { ...typography.label, color: colors.text },
  stepText: { ...typography.caption, color: colors.textSecondary, marginTop: 1 },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  primaryButton: { width: '100%' },
  secondaryButton: { width: '100%' },
});
