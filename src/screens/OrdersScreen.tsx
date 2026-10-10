import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { AppButton, AppCard, AppScreen } from '../components/ui';
import { listMyOrders, OrderServiceError } from '../services/orders';
import type { Order, OrderStatus } from '../types/orders';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';

type OrdersScreenProps = {
  navigation?: { goBack: () => void };
};

const statusLabels: Record<OrderStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

function statusPresentation(status: OrderStatus) {
  if (status === 'pendente') return { icon: 'clock-outline' as const, color: colors.warning, style: styles.statusPending, textStyle: styles.statusTextPending };
  if (status === 'cancelado') return { icon: 'close-circle-outline' as const, color: colors.error, style: styles.statusCancelled, textStyle: styles.statusTextCancelled };
  if (status === 'concluido') return { icon: 'check-circle' as const, color: colors.success, style: styles.status, textStyle: styles.statusText };
  return { icon: 'progress-check' as const, color: colors.primary, style: styles.status, textStyle: styles.statusTextConfirmed };
}

function formatReal(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatGemn(value: number | null) {
  return value === null ? 'Não aplicável' : `${value.toLocaleString('pt-BR')} GEMN`;
}

function orderTotal(order: Order) {
  return order.formaPagamento === 'gemn' ? formatGemn(order.totalGemn) : formatReal(order.totalReal);
}

function paymentLabel(order: Order) {
  return order.formaPagamento === 'gemn' ? 'Moeda GEMN' : 'Reais';
}

function friendlyOrdersError(error: unknown) {
  if (error instanceof OrderServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível carregar seus pedidos. Tente novamente.';
}

export default function OrdersScreen({ navigation }: OrdersScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadOrders = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    try {
      const result = await listMyOrders();
      setOrders(result);
    } catch (error) {
      setErrorMessage(friendlyOrdersError(error));
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    void loadOrders();
  }, [loadOrders]));

  return (
    <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar" style={styles.backButton} onPress={() => navigation?.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>Histórico de compras</Text>
          <Text style={styles.title}>Meus pedidos</Text>
          <Text style={styles.subtitle}>Acompanhe suas compras na comunidade</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar pedidos" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadOrders(true); }}>
          <MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.feedbackState}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.feedbackText}>Carregando seus pedidos...</Text>
        </View>
      ) : errorMessage ? (
        <AppCard style={styles.feedbackCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} />
          <Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar os pedidos</Text>
          <Text style={styles.feedbackText}>{errorMessage}</Text>
          <AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadOrders(true); }} />
        </AppCard>
      ) : orders.length === 0 ? (
        <AppCard style={styles.feedbackCard}>
          <MaterialCommunityIcons name="clipboard-text-outline" size={42} color={colors.primary} />
          <Text style={styles.feedbackTitle}>Você ainda não tem pedidos</Text>
          <Text style={styles.feedbackText}>Seus pedidos registrados aparecerão aqui.</Text>
          <AppButton title="Atualizar" variant="outline" onPress={() => { void loadOrders(true); }} />
        </AppCard>
      ) : (
        <View style={[styles.ordersGrid, wide && styles.ordersGridWide]}>
          {orders.map((order) => {
            const item = order.items[0];
            const status = statusPresentation(order.status);
            return (
              <View key={order.id} style={[styles.orderWrapper, wide && styles.orderWrapperWide]}>
                <AppCard elevated={wide} style={styles.orderCard}>
                  <View style={styles.orderHeader}>
                    <View style={styles.orderHeaderCopy}>
                      <Text style={styles.orderLabel}>Pedido</Text>
                      <Text style={styles.orderId}>{order.id}</Text>
                    </View>
                    <View style={[styles.status, status.style]}>
                      <MaterialCommunityIcons name={status.icon} size={16} color={status.color} />
                      <Text style={[styles.statusText, status.textStyle]}>{statusLabels[order.status]}</Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.productRow}>
                    <View style={styles.productIcon}>
                      <MaterialCommunityIcons name="package-variant-closed" size={27} color={colors.primary} />
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{item?.nomeItem ?? 'Item do pedido'}</Text>
                      <Text style={styles.quantity}>Quantidade: {item?.quantidade ?? order.items.reduce((sum, current) => sum + current.quantidade, 0)}</Text>
                    </View>
                  </View>

                  <View style={styles.summary}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Forma escolhida</Text>
                      <Text style={styles.summaryValue}>{paymentLabel(order)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Total</Text>
                      <Text style={styles.total}>{orderTotal(order)}</Text>
                    </View>
                  </View>
                  {order.status === 'pendente' ? <Text style={styles.pendingNote}>Pedido pendente não significa pagamento realizado.</Text> : null}
                </AppCard>
              </View>
            );
          })}
        </View>
      )}

      {!loading && !errorMessage && orders.length > 0 ? <AppCard style={styles.infoBox}>
        <View style={styles.infoIcon}><MaterialCommunityIcons name="information-outline" size={20} color={colors.primary} /></View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Seu histórico GEMN</Text>
          <Text style={styles.infoText}>Pedidos pendentes representam uma intenção registrada. Pagamentos e débitos GEMN não são realizados nesta etapa.</Text>
        </View>
      </AppCard> : null}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  backButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  refreshButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  feedbackState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl },
  feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border },
  feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  ordersGrid: { gap: spacing.md },
  ordersGridWide: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap' },
  orderWrapper: { width: '100%' },
  orderWrapperWide: { flex: 1, minWidth: 320, maxWidth: '50%' },
  orderCard: { flex: 1, borderWidth: 1, borderColor: colors.border },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm },
  orderHeaderCopy: { flex: 1, minWidth: 0 },
  orderLabel: { ...typography.caption, color: colors.textSecondary },
  orderId: { ...typography.label, color: colors.text, marginTop: spacing.xs },
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 28, borderRadius: radius.full, backgroundColor: colors.primaryLight },
  statusPending: { backgroundColor: colors.secondaryLight },
  statusCancelled: { backgroundColor: '#FDECEC' },
  statusText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  statusTextPending: { color: colors.warning },
  statusTextConfirmed: { color: colors.primary },
  statusTextCancelled: { color: colors.error },
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
  pendingNote: { ...typography.caption, color: colors.warning, marginTop: spacing.md },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primaryLight, padding: spacing.md, borderWidth: 1, borderColor: colors.primaryLight },
  infoIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  infoTitle: { ...typography.label, color: colors.text },
  infoText: { ...typography.caption, color: colors.textSecondary },
});
