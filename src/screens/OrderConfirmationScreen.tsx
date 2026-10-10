import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RouteProp } from '@react-navigation/native';

import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import type { OrderConfirmationParams } from './ProductScreen';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

type OrderConfirmationStackParamList = {
  OrderConfirmation: OrderConfirmationParams;
};

type OrderConfirmationScreenProps = {
  route?: RouteProp<OrderConfirmationStackParamList, 'OrderConfirmation'>;
  navigation?: NativeStackNavigationProp<OrderConfirmationStackParamList, 'OrderConfirmation'> & {
    navigate: (screen: 'Marketplace', params: { screen: 'MarketplaceHome' }) => void;
  };
};

function formatReal(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatGemn(value: number | null) {
  return value === null ? 'Não aplicável' : `${value.toLocaleString('pt-BR')} GEMN`;
}

export default function OrderConfirmationScreen({ route, navigation }: OrderConfirmationScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  if (!route?.params) return null;
  const { itemName, quantidade, formaPagamento, orderId, status, totalReal, totalGemn } = route.params;

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={[styles.confirmation, wide && styles.confirmationWide]}>
        <View style={styles.hero}>
          <View style={styles.successIcon}>
            <MaterialCommunityIcons name="check" size={34} color={colors.white} />
          </View>
          <AppBadge label="PEDIDO REGISTRADO" variant="success" />
          <Text style={styles.title}>Pedido criado</Text>
          <Text style={styles.subtitle}>Seu pedido está com status {status} e aguardando processamento.</Text>
        </View>

        <View style={styles.orderNumber}>
          <View>
            <Text style={styles.orderNumberLabel}>Identificador do pedido</Text>
            <Text style={styles.orderNumberValue}>{orderId}</Text>
          </View>
          <MaterialCommunityIcons name="clock-check-outline" size={28} color={colors.primary} />
        </View>

        <View style={[styles.details, wide && styles.detailsWide]}>
          <AppCard elevated={wide} style={styles.card}>
            <Text style={styles.cardTitle}>Resumo do pedido</Text>
            <View style={styles.productRow}>
              <View style={styles.productIcon}><MaterialCommunityIcons name="package-variant-closed" size={28} color={colors.primary} /></View>
              <View style={styles.productInfo}>
                <Text style={styles.productName}>{itemName}</Text>
                <Text style={styles.quantity}>Quantidade: {quantidade}</Text>
              </View>
            </View>
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>Forma escolhida</Text>
              <View style={styles.paymentValue}>
                <MaterialCommunityIcons name={formaPagamento === 'real' ? 'cash' : 'star-four-points'} size={16} color={formaPagamento === 'real' ? colors.primary : colors.secondary} />
                <Text style={styles.value}>{formaPagamento === 'real' ? 'Reais' : 'Moeda GEMN'}</Text>
              </View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>{formaPagamento === 'real' ? 'Total em reais' : 'Total em GEMN'}</Text>
              <Text style={styles.total}>{formaPagamento === 'real' ? formatReal(totalReal) : formatGemn(totalGemn)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Total em reais</Text>
              <Text style={styles.value}>{formatReal(totalReal)}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Total em GEMN</Text>
              <Text style={styles.value}>{formatGemn(totalGemn)}</Text>
            </View>
          </AppCard>

          <AppCard elevated={wide} style={[styles.card, styles.stepsCard]}>
            <Text style={styles.cardTitle}>Acompanhe seu pedido</Text>
            <View style={styles.step}>
              <View style={[styles.stepIcon, styles.stepIconActive]}><MaterialCommunityIcons name="check" size={16} color={colors.white} /></View>
              <View style={styles.stepCopy}><Text style={styles.stepTitle}>Pedido recebido</Text><Text style={styles.stepText}>Aguardando processamento</Text></View>
            </View>
            <View style={styles.step}>
              <View style={styles.stepIcon}><MaterialCommunityIcons name="clock-outline" size={17} color={colors.secondary} /></View>
              <View style={styles.stepCopy}><Text style={styles.stepTitle}>Processamento</Text><Text style={styles.stepText}>Novas atualizações aparecerão aqui</Text></View>
            </View>
            <View style={styles.stepLast}>
              <View style={styles.stepIcon}><MaterialCommunityIcons name="package-variant" size={17} color={colors.textSecondary} /></View>
              <View style={styles.stepCopy}><Text style={styles.stepTitle}>Preparação do pedido</Text><Text style={styles.stepText}>Será iniciada posteriormente</Text></View>
            </View>
            <Text style={styles.paymentNote}>A forma escolhida representa apenas a intenção registrada. Nenhum pagamento foi realizado e nenhuma moeda GEMN foi debitada.</Text>
          </AppCard>
        </View>

        <View style={[styles.actions, wide && styles.actionsWide]}>
          <AppButton title="Continuar comprando" fullWidth={!wide} onPress={() => navigation?.navigate('Marketplace', { screen: 'MarketplaceHome' })} style={[styles.primaryButton, wide && styles.actionButtonWide]} />
          <AppButton title="Voltar" variant="outline" fullWidth={!wide} onPress={() => navigation?.goBack()} style={[styles.secondaryButton, wide && styles.actionButtonWide]} />
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm },
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
  paymentNote: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.xs },
  actionsWide: { flexDirection: 'row', justifyContent: 'center' },
  primaryButton: {},
  secondaryButton: {},
  actionButtonWide: { width: 200, maxWidth: 200 },
});
