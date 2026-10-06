import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppCard, AppScreen } from '../components/ui';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

export default function OrdersScreen({ navigation }: any) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const orders = [
    {
      id: '#GEMN-0001',
      product: 'Cesta de frutas',
      quantity: 2,
      total: 'R$ 100,00',
      status: 'Confirmado',
      statusIcon: 'check-circle' as const,
    },
    {
      id: '#GEMN-0002',
      product: 'Camisa GEMN',
      quantity: 1,
      total: 'R$ 80,00',
      status: 'Em processamento',
      statusIcon: 'clock-outline' as const,
    },
  ];

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar" style={styles.backButton} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Histórico de compras</Text>
          <Text style={styles.title}>Meus pedidos</Text>
          <Text style={styles.subtitle}>Acompanhe suas compras na comunidade</Text>
        </View>
      </View>

      <View style={[styles.ordersGrid, wide && styles.ordersGridWide]}>
        {orders.map((order) => (
          <TouchableOpacity key={order.id} activeOpacity={0.85} style={[styles.orderWrapper, wide && styles.orderWrapperWide]}>
            <AppCard elevated={wide} style={styles.orderCard}>
              <View style={styles.orderHeader}>
                <View>
                  <Text style={styles.orderLabel}>Pedido</Text>
                  <Text style={styles.orderId}>{order.id}</Text>
                </View>
                <View style={[styles.status, order.status === 'Em processamento' && styles.statusPending]}>
                  <MaterialCommunityIcons name={order.statusIcon} size={16} color={order.status === 'Em processamento' ? colors.warning : colors.success} />
                  <Text style={[styles.statusText, order.status === 'Em processamento' && styles.statusTextPending]}>{order.status}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.productRow}>
                <View style={styles.productIcon}>
                  <MaterialCommunityIcons name="package-variant-closed" size={27} color={colors.primary} />
                </View>
                <View style={styles.productInfo}>
                  <Text style={styles.productName}>{order.product}</Text>
                  <Text style={styles.quantity}>Quantidade: {order.quantity}</Text>
                </View>
              </View>

              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Forma de pagamento</Text>
                  <Text style={styles.summaryValue}>Não informado</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Total</Text>
                  <Text style={styles.total}>{order.total}</Text>
                </View>
              </View>
            </AppCard>
          </TouchableOpacity>
        ))}
      </View>

      <AppCard style={styles.infoBox}>
        <View style={styles.infoIcon}>
          <MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} />
        </View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Seu histórico GEMN</Text>
          <Text style={styles.infoText}>Aqui você poderá acompanhar todos os seus pedidos realizados.</Text>
        </View>
      </AppCard>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  ordersGrid: { gap: spacing.md },
  ordersGridWide: { flexDirection: 'row', alignItems: 'stretch' },
  orderWrapper: { width: '100%' },
  orderWrapperWide: { flex: 1, minWidth: 0 },
  orderCard: { flex: 1, borderWidth: 1, borderColor: colors.border },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  orderLabel: { ...typography.caption, color: colors.textSecondary },
  orderId: { ...typography.label, color: colors.text, marginTop: spacing.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 28, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  statusPending: { backgroundColor: colors.secondaryLight },
  statusText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  statusTextPending: { color: colors.warning },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  productRow: { flexDirection: 'row', alignItems: 'center' },
  productIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' },
  productInfo: { flex: 1, marginLeft: spacing.md },
  productName: { ...typography.heading3, color: colors.text },
  quantity: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  summary: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  summaryValue: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  total: { ...typography.heading2, color: colors.primary },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, padding: spacing.md, borderWidth: 1, borderColor: colors.primaryLight },
  infoIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  infoTitle: { ...typography.label, color: colors.text },
  infoText: { ...typography.caption, color: colors.textSecondary },
});
