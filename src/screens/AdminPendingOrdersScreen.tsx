import React from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AppBadge, AppButton, AppCard, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { confirmAdminOrder, listAdminPendingOrders } from '../services/adminOrders';
import { AdminOrderServiceError } from '../types/adminOrders';
import type { AdminPendingOrder } from '../types/adminOrders';
import { AccessDenied } from './AdminHomeScreen';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';
import { supabase } from '../lib/supabase';

const PAGE_SIZE = 50;
function formatReal(value: number) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function formatGemn(value: number | null) { return value === null ? 'Não aplicável' : `${value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} GEMN`; }
function formatDate(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
function paymentLabel(value: AdminPendingOrder['formaPagamento']) { return value === 'real' ? 'Reais' : value === 'gemn' ? '100% GEMN' : 'Misto (Reais + GEMN)'; }
function friendlyError(error: unknown) { return error instanceof AdminOrderServiceError ? error.message : 'Não foi possível carregar os pedidos administrativos.'; }

export default function AdminPendingOrdersScreen({ navigation }: any) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [isAdmin, setIsAdmin] = React.useState<boolean | null>(null);
  const [orders, setOrders] = React.useState<AdminPendingOrder[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = React.useState<AdminPendingOrder | null>(null);
  const [confirmationError, setConfirmationError] = React.useState<string | null>(null);
  const [processing, setProcessing] = React.useState(false);
  const intentKeys = React.useRef<Record<string, string>>({});

  const loadOrders = React.useCallback(async (reset = true) => {
    if (reset) setLoading(true); else setLoadingMore(true);
    setErrorMessage(null);
    try {
      const page = await listAdminPendingOrders(PAGE_SIZE, reset ? 0 : orders.length);
      setOrders((current) => reset ? page : [...current, ...page]);
      setHasMore(page.length === PAGE_SIZE);
    } catch (error) { setErrorMessage(friendlyError(error)); }
    finally { if (reset) setLoading(false); else setLoadingMore(false); }
  }, [orders.length]);

  React.useEffect(() => {
    let mounted = true;
    async function checkAdmin() {
      if (!user) { setIsAdmin(false); setLoading(false); return; }
      const { data, error } = await supabase.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!mounted) return;
      setIsAdmin(!error && data?.is_admin === true);
      if (error || data?.is_admin !== true) setLoading(false);
    }
    void checkAdmin();
    return () => { mounted = false; };
  }, [user]);

  useFocusEffect(React.useCallback(() => {
    if (isAdmin === true) void loadOrders(true);
  }, [isAdmin, loadOrders]));

  async function refresh() {
    setRefreshing(true);
    await loadOrders(true);
    setRefreshing(false);
  }

  function openConfirmation(order: AdminPendingOrder) {
    if (!order.confirmavel) { setNotice('Este pedido está vencido e não pode ser confirmado.'); return; }
    setConfirmationError(null); setNotice(null); setSelectedOrder(order);
  }

  async function confirmSelected() {
    if (!selectedOrder || processing || !selectedOrder.confirmavel) return;
    const order = selectedOrder;
    const idempotencyKey = intentKeys.current[order.orderId] ?? Crypto.randomUUID();
    intentKeys.current[order.orderId] = idempotencyKey;
    setProcessing(true); setConfirmationError(null); setNotice(null);
    try {
      const result = await confirmAdminOrder(order.orderId, idempotencyKey);
      delete intentKeys.current[order.orderId];
      setSelectedOrder(null);
      setOrders((current) => current.filter((item) => item.orderId !== order.orderId));
      setNotice(`Pedido confirmado em modo simulado. GEMN consumido: ${formatGemn(result.gemnConsumido)} · Cashback creditado: ${formatGemn(result.cashbackCreditado)}.`);
    } catch (error) {
      if (error instanceof AdminOrderServiceError && error.retryable) {
        try {
          const refreshed = await listAdminPendingOrders(PAGE_SIZE, 0);
          setOrders(refreshed);
          if (!refreshed.some((item) => item.orderId === order.orderId)) {
            delete intentKeys.current[order.orderId]; setSelectedOrder(null); setNotice('Não foi possível confirmar o resultado. O pedido não aparece mais como pendente; verifique seu estado antes de repetir.');
          } else setConfirmationError('Não foi possível confirmar o resultado. A mesma chave foi preservada; consulte novamente antes de tentar repetir.');
        } catch (refreshError) { setConfirmationError(`${friendlyError(refreshError)} A chave de idempotência foi preservada.`); }
      } else {
        if (error instanceof AdminOrderServiceError && error.kind === 'expired') setSelectedOrder((current) => current ? { ...current, confirmavel: false } : current);
        setConfirmationError(friendlyError(error));
      }
    } finally { setProcessing(false); }
  }

  if (isAdmin === null) return <AppScreen><View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Verificando acesso administrativo...</Text></View></AppScreen>;
  if (isAdmin === false) return <AccessDenied />;
  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
    <View style={styles.header}><Pressable accessibilityRole="button" accessibilityLabel="Voltar" style={styles.iconButton} onPress={() => navigation?.goBack()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} /></Pressable><View style={styles.headerCopy}><Text style={styles.eyebrow}>Operação administrativa</Text><Text style={styles.title}>Pedidos pendentes</Text><Text style={styles.subtitle}>Confirme pagamentos simulados após revisar os dados do pedido.</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Atualizar pedidos pendentes" style={styles.iconButton} disabled={loading || refreshing} onPress={() => { void refresh(); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></Pressable></View>
    <View style={styles.simulatedBanner}><MaterialCommunityIcons name="flask-outline" size={20} color={colors.warning} /><Text style={styles.simulatedText}>SIMULAÇÃO — esta ação não comprova recebimento de dinheiro real.</Text></View>
    {notice ? <AppCard style={styles.notice}><MaterialCommunityIcons name="check-circle-outline" size={20} color={colors.success} /><Text style={styles.noticeText}>{notice}</Text></AppCard> : null}
    {loading ? <View style={styles.loading}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando pedidos...</Text></View> : errorMessage ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} /><Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar a fila</Text><Text style={styles.feedbackText}>{errorMessage}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadOrders(true); }} /></AppCard> : orders.length === 0 ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="check-circle-outline" size={42} color={colors.success} /><Text style={styles.feedbackTitle}>Nenhum pedido pendente</Text><Text style={styles.feedbackText}>Novos pedidos aparecerão aqui para análise.</Text></AppCard> : <View style={[styles.list, wide && styles.listWide]}>{orders.map((order) => <OrderCard key={order.orderId} order={order} onConfirm={() => openConfirmation(order)} />)}{hasMore ? <AppButton title={loadingMore ? 'Carregando...' : 'Carregar mais'} variant="outline" onPress={() => { void loadOrders(false); }} loading={loadingMore} disabled={loadingMore} /> : null}</View>}
    <ConfirmationModal order={selectedOrder} processing={processing} errorMessage={confirmationError} onCancel={() => { if (!processing) { setSelectedOrder(null); setConfirmationError(null); } }} onConfirm={() => { void confirmSelected(); }} />
  </AppScreen>;
}

function OrderCard({ order, onConfirm }: { order: AdminPendingOrder; onConfirm: () => void }) {
  return <AppCard style={[styles.orderCard, !order.confirmavel && styles.expiredCard]}><View style={styles.cardHeader}><AppBadge label={order.confirmavel ? 'Aguardando confirmação' : 'Vencido'} variant={order.confirmavel ? 'warning' : 'neutral'} /><Text style={styles.date}>{formatDate(order.criadoEm)}</Text></View><Text style={styles.productName}>{order.nomeItem}</Text><Text style={styles.orderMeta}>Comprador: {order.buyerId}</Text><Text style={styles.orderMeta}>Quantidade: {order.quantidade} · {paymentLabel(order.formaPagamento)}</Text><View style={styles.financials}><Summary label="Valor bruto em reais" value={formatReal(order.totalReal)} /><Summary label="GEMN utilizado" value={formatGemn(order.gemnUtilizado)} /><Summary label="Devido em reais" value={formatReal(order.valorDevidoReal)} /></View><View style={styles.expiration}><MaterialCommunityIcons name={order.confirmavel ? 'clock-outline' : 'timer-off-outline'} size={17} color={order.confirmavel ? colors.warning : colors.error} /><Text style={[styles.expirationText, !order.confirmavel && styles.expiredText]}>{order.confirmavel ? `Prazo até ${formatDate(order.expiraEm)}` : `Prazo encerrado em ${formatDate(order.expiraEm)}`}</Text></View><AppButton title={order.confirmavel ? 'Revisar e confirmar' : 'Pedido vencido'} variant={order.confirmavel ? 'primary' : 'outline'} onPress={onConfirm} disabled={!order.confirmavel} fullWidth /></AppCard>;
}
function Summary({ label, value }: { label: string; value: string }) { return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{value}</Text></View>; }
function ConfirmationModal({ order, processing, errorMessage, onCancel, onConfirm }: { order: AdminPendingOrder | null; processing: boolean; errorMessage: string | null; onCancel: () => void; onConfirm: () => void }) {
  return <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}><View style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modal}><Text style={styles.modalTitle}>Confirmar pagamento simulado?</Text><Text style={styles.modalText}>Você está prestes a confirmar o pedido “{order?.nomeItem}”. Esta ação usará a RPC financeira existente, consumirá a reserva GEMN quando aplicável e poderá gerar cashback.</Text><Text style={styles.modalWarning}>Nenhum pagamento real será processado.</Text>{errorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{errorMessage}</Text> : null}<View style={styles.modalActions}><AppButton title="Voltar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} /><AppButton title={order?.confirmavel ? 'Confirmar simulação' : 'Pedido não confirmável'} onPress={onConfirm} loading={processing} disabled={processing || !order?.confirmavel} style={styles.modalButton} /></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg }, header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, iconButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, gap: spacing.xs }, eyebrow: { ...typography.caption, color: colors.textSecondary }, title: { ...typography.heading1, color: colors.text }, subtitle: { ...typography.bodySmall, color: colors.textSecondary }, simulatedBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' }, simulatedText: { ...typography.caption, color: colors.warning, flex: 1, fontWeight: '600' }, list: { gap: spacing.md }, listWide: { maxWidth: 900, width: '100%', alignSelf: 'center' }, orderCard: { borderWidth: 1, borderColor: colors.border, gap: spacing.sm }, expiredCard: { borderColor: '#F2C8C8', backgroundColor: '#FFF9F9' }, cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }, date: { ...typography.caption, color: colors.textMuted }, productName: { ...typography.heading3, color: colors.text }, orderMeta: { ...typography.caption, color: colors.textSecondary }, financials: { borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, gap: spacing.xs }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md }, summaryLabel: { ...typography.caption, color: colors.textSecondary, flex: 1 }, summaryValue: { ...typography.label, color: colors.text, textAlign: 'right' }, expiration: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs }, expirationText: { ...typography.caption, color: colors.warning }, expiredText: { color: colors.error }, loading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }, feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' }, notice: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.primaryLight, borderColor: colors.primaryLight }, noticeText: { ...typography.bodySmall, color: colors.text, flex: 1 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, modal: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }, modalTitle: { ...typography.heading3, color: colors.text }, modalText: { ...typography.bodySmall, color: colors.textSecondary }, modalWarning: { ...typography.label, color: colors.warning }, modalError: { ...typography.bodySmall, color: colors.error }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm }, modalButton: { flex: 1 },
});
