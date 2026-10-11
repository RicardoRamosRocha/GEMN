import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { requestOrderCancellation } from '../services/cancellationRequests';
import { listSellerCancellationRequests, listSellerRelatedOrders } from '../services/cancellationRequestQueries';
import { CancellationRequestServiceError } from '../types/cancellationRequests';
import type { SellerCancellationRequestQuery, SellerRelatedOrder } from '../types/cancellationRequestQueries';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';
import { isGemnUiFixturesEnabled } from '../dev/ordersUiFixtures';
import { createSellerFixtureCancellationRequest, sellerFixtureRequestsByOrder, sellerOrdersUiFixtures } from '../dev/sellerOrdersUiFixtures';

type SellerOrdersScreenProps = { navigation?: { goBack: () => void } };

function formatReal(value: number) { return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function paymentLabel(order: SellerRelatedOrder) { return order.formaPagamento === 'gemn' ? '100% GEMN' : order.formaPagamento === 'misto' ? 'Misto' : 'Reais'; }
function statusLabel(status: string) { return status === 'confirmado' ? 'Confirmado' : status === 'pendente' ? 'Pendente' : status === 'concluido' ? 'Concluído' : status === 'cancelado' ? 'Cancelado' : status; }
function statusStyle(status: string) {
  if (status === 'confirmado') return { icon: 'progress-check' as const, color: colors.primary, background: colors.primaryLight, text: colors.primary };
  if (status === 'cancelado') return { icon: 'close-circle-outline' as const, color: colors.error, background: '#FDECEC', text: colors.error };
  if (status === 'concluido') return { icon: 'check-circle-outline' as const, color: colors.success, background: colors.primaryLight, text: colors.success };
  return { icon: 'clock-outline' as const, color: colors.warning, background: colors.secondaryLight, text: colors.warning };
}
function requestStatus(request: SellerCancellationRequestQuery | undefined) {
  if (!request) return null;
  if (request.status === 'pendente') return { label: 'Aguardando análise', variant: 'warning' as const, icon: 'clock-outline' as const };
  if (request.status === 'aprovada') return { label: 'Aprovada', variant: 'success' as const, icon: 'check-circle-outline' as const };
  if (request.status === 'rejeitada') return { label: 'Rejeitada', variant: 'neutral' as const, icon: 'close-circle-outline' as const };
  return { label: 'Em análise administrativa', variant: 'warning' as const, icon: 'alert-circle-outline' as const };
}
function friendlyError(error: unknown) {
  if (error instanceof CancellationRequestServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível carregar os pedidos recebidos.';
}
function latestRequestsByOrder(requests: SellerCancellationRequestQuery[]) {
  return requests.reduce<Record<string, SellerCancellationRequestQuery>>((result, request) => {
    const current = result[request.orderId];
    if (!current || new Date(request.atualizadoEm).getTime() >= new Date(current.atualizadoEm).getTime()) result[request.orderId] = request;
    return result;
  }, {});
}

export default function SellerOrdersScreen({ navigation }: SellerOrdersScreenProps) {
  const { user } = useAuth();
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [orders, setOrders] = useState<SellerRelatedOrder[]>([]);
  const [requests, setRequests] = useState<Record<string, SellerCancellationRequestQuery>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<SellerRelatedOrder | null>(null);
  const [reason, setReason] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [inconclusiveMessage, setInconclusiveMessage] = useState<string | null>(null);
  const intentKeysRef = useRef<Record<string, string>>({});
  const fixturesEnabled = isGemnUiFixturesEnabled();

  const loadData = useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    setInconclusiveMessage(null);
    try {
      if (fixturesEnabled) {
        setOrders(sellerOrdersUiFixtures);
        setRequests(sellerFixtureRequestsByOrder());
        return;
      }
      if (!user) throw new CancellationRequestServiceError('auth', 'É necessário estar autenticado para consultar pedidos recebidos.');
      const [orderRows, requestRows] = await Promise.all([listSellerRelatedOrders(), listSellerCancellationRequests()]);
      setOrders(orderRows);
      setRequests(latestRequestsByOrder(requestRows));
    } catch (error) {
      setErrorMessage(friendlyError(error));
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
  }, [fixturesEnabled, user]);

  useFocusEffect(useCallback(() => { void loadData(); }, [loadData]));

  function openModal(order: SellerRelatedOrder) {
    const request = requests[order.orderId];
    if (order.orderStatus !== 'confirmado' || request?.status === 'pendente' || request?.status === 'execucao_falhou' || request?.status === 'aprovada') return;
    if (!intentKeysRef.current[order.orderId]) intentKeysRef.current[order.orderId] = Crypto.randomUUID();
    setSelectedOrder(order);
    setReason('');
    setRequestError(null);
    setInconclusiveMessage(null);
  }

  function closeModal() {
    if (processing) return;
    if (selectedOrder) delete intentKeysRef.current[selectedOrder.orderId];
    setSelectedOrder(null);
    setReason('');
    setRequestError(null);
  }

  async function submitRequest() {
    if (!selectedOrder || processing) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) { setRequestError('Informe o motivo do cancelamento.'); return; }
    const orderId = selectedOrder.orderId;
    const idempotencyKey = intentKeysRef.current[orderId] ?? Crypto.randomUUID();
    intentKeysRef.current[orderId] = idempotencyKey;
    setProcessing(true);
    setRequestError(null);
    setInconclusiveMessage(null);
    try {
      if (fixturesEnabled) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        setRequests((current) => ({ ...current, [orderId]: createSellerFixtureCancellationRequest(orderId, trimmedReason) }));
        setInconclusiveMessage('Demonstração local: a solicitação foi registrada apenas na memória desta tela. Nenhum dado real foi alterado.');
        delete intentKeysRef.current[orderId];
        setSelectedOrder(null);
        setReason('');
        return;
      }
      await requestOrderCancellation({ orderId, idempotencyKey, motivo: trimmedReason });
      delete intentKeysRef.current[orderId];
      setSelectedOrder(null);
      setReason('');
      await loadData(true);
    } catch (error) {
      const serviceError = error instanceof CancellationRequestServiceError ? error : null;
      if (serviceError?.kind === 'network' || serviceError?.retryable) {
        try {
          const currentRequests = await listSellerCancellationRequests();
          setRequests(latestRequestsByOrder(currentRequests));
          if (currentRequests.some((request) => request.orderId === orderId)) setSelectedOrder(null);
          else setInconclusiveMessage('Não foi possível confirmar o resultado. Atualizamos as solicitações; verifique o status antes de tentar novamente. A mesma intenção será reutilizada.');
        } catch (refreshError) {
          setInconclusiveMessage(`${friendlyError(refreshError)} O resultado da solicitação original continua inconclusivo.`);
        }
      } else setRequestError(friendlyError(error));
    } finally { setProcessing(false); }
  }

  return <AppScreen scroll edges={['bottom']} contentContainerStyle={styles.content}>
    <View style={styles.header}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Voltar" style={styles.backButton} onPress={() => navigation?.goBack()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.text} /></TouchableOpacity>
      <View style={styles.headerCopy}><Text style={styles.eyebrow}>Área do vendedor</Text><Text style={styles.title}>Pedidos recebidos</Text><Text style={styles.subtitle}>Acompanhe pedidos relacionados aos seus produtos</Text></View>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar pedidos recebidos" style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadData(true); }}><MaterialCommunityIcons name="refresh" size={22} color={loading || refreshing ? colors.textSecondary : colors.primary} /></TouchableOpacity>
    </View>
    {fixturesEnabled ? <View style={styles.demoBanner} accessibilityRole="text"><MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} /><Text style={styles.demoBannerText}>Modo de demonstração — dados sintéticos locais</Text></View> : null}
    {loading ? <View style={styles.feedbackState}><ActivityIndicator color={colors.primary} /><Text style={styles.feedbackText}>Carregando pedidos recebidos...</Text></View> : errorMessage ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="alert-circle-outline" size={36} color={colors.error} /><Text accessibilityRole="alert" style={styles.feedbackTitle}>Não foi possível carregar os pedidos</Text><Text style={styles.feedbackText}>{errorMessage}</Text><AppButton title="Tentar novamente" variant="outline" onPress={() => { void loadData(true); }} /></AppCard> : orders.length === 0 ? <AppCard style={styles.feedbackCard}><MaterialCommunityIcons name="clipboard-arrow-down-outline" size={42} color={colors.primary} /><Text style={styles.feedbackTitle}>Nenhum pedido relacionado</Text><Text style={styles.feedbackText}>Pedidos dos seus produtos aparecerão aqui.</Text><AppButton title="Atualizar" variant="outline" onPress={() => { void loadData(true); }} /></AppCard> : <View style={[styles.ordersGrid, wide && styles.ordersGridWide]}>
      {orders.map((order) => {
        const visualStatus = statusStyle(order.orderStatus);
        const cancellation = requests[order.orderId];
        const cancellationVisual = requestStatus(cancellation);
        const canRequest = order.orderStatus === 'confirmado' && (!cancellation || cancellation.status === 'rejeitada');
        return <View key={`${order.orderId}-${order.itemId}`} style={[styles.orderWrapper, wide && styles.orderWrapperWide]}><AppCard elevated={wide} style={styles.orderCard}>
          <View style={styles.orderHeader}><View style={styles.orderHeaderCopy}><Text style={styles.orderLabel}>Pedido</Text><Text style={styles.orderId}>{order.orderId}</Text></View><View style={[styles.status, { backgroundColor: visualStatus.background }]}><MaterialCommunityIcons name={visualStatus.icon} size={16} color={visualStatus.color} /><Text style={[styles.statusText, { color: visualStatus.text }]}>{statusLabel(order.orderStatus)}</Text></View></View>
          <View style={styles.divider} />
          <View style={styles.productRow}><View style={styles.productIcon}><MaterialCommunityIcons name="package-variant-closed" size={27} color={colors.primary} /></View><View style={styles.productInfo}><Text style={styles.productName}>{order.nomeItem}</Text><Text style={styles.quantity}>Quantidade: {order.quantidade}</Text></View></View>
          <View style={styles.summary}><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Forma de pagamento</Text><Text style={styles.summaryValue}>{paymentLabel(order)}</Text></View><View style={styles.summaryRow}><Text style={styles.summaryLabel}>Valor devido</Text><Text style={styles.total}>{formatReal(order.valorDevidoReal)}</Text></View></View>
          {cancellationVisual ? <View style={styles.cancellationStatus}><View style={styles.cancellationHeader}><MaterialCommunityIcons name={cancellationVisual.icon} size={18} color={colors.primary} /><AppBadge label={cancellationVisual.label} variant={cancellationVisual.variant} /></View>{cancellation?.motivoDecisao ? <Text style={styles.cancellationNote}>Motivo: {cancellation.motivoDecisao}</Text> : null}</View> : null}
          {canRequest ? <AppButton title="Solicitar cancelamento" variant="outline" fullWidth onPress={() => openModal(order)} style={styles.cancelButton} /> : null}
        </AppCard></View>;
      })}
    </View>}
    {inconclusiveMessage ? <AppCard style={styles.warningBox}><MaterialCommunityIcons name="cloud-question" size={20} color={colors.warning} /><Text style={styles.warningText}>{inconclusiveMessage}</Text></AppCard> : null}
    <SellerCancellationModal order={selectedOrder} reason={reason} processing={processing} errorMessage={requestError} onReasonChange={setReason} onCancel={closeModal} onConfirm={() => { void submitRequest(); }} />
  </AppScreen>;
}

function SellerCancellationModal({ order, reason, processing, errorMessage, onReasonChange, onCancel, onConfirm }: { order: SellerRelatedOrder | null; reason: string; processing: boolean; errorMessage: string | null; onReasonChange: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  return <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}><KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}><View accessibilityViewIsModal style={styles.modalCard}>
    <Text style={styles.modalTitle}>Solicitar cancelamento</Text><Text style={styles.modalDescription}>Pedido {order?.orderId}</Text><Text style={styles.modalDescription}>{order?.nomeItem}</Text>
    <AppInput label="Motivo do cancelamento" value={reason} onChangeText={onReasonChange} placeholder="Descreva o motivo" multiline maxLength={1000} error={errorMessage ?? undefined} autoFocus />
    <View style={styles.modalActions}><AppButton title="Voltar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} /><AppButton title="Confirmar solicitação" onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} /></View>
  </View></KeyboardAvoidingView></Modal>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.lg }, header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md }, backButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, refreshButton: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' }, headerCopy: { flex: 1, gap: spacing.xs }, eyebrow: { ...typography.caption, color: colors.textSecondary }, title: { ...typography.heading1, color: colors.text }, subtitle: { ...typography.bodySmall, color: colors.textSecondary }, feedbackState: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xxl }, feedbackCard: { alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderColor: colors.border }, feedbackTitle: { ...typography.heading3, color: colors.text, textAlign: 'center' }, feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' }, ordersGrid: { gap: spacing.md }, ordersGridWide: { flexDirection: 'row', alignItems: 'stretch', flexWrap: 'wrap' }, orderWrapper: { width: '100%' }, orderWrapperWide: { flex: 1, minWidth: 320, maxWidth: '50%' }, orderCard: { flex: 1, borderWidth: 1, borderColor: colors.border }, orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.sm }, orderHeaderCopy: { flex: 1, minWidth: 0 }, orderLabel: { ...typography.caption, color: colors.textSecondary }, orderId: { ...typography.label, color: colors.text, marginTop: spacing.xs }, status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 28, borderRadius: radius.full }, statusText: { ...typography.caption, fontWeight: '600' }, divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md }, productRow: { flexDirection: 'row', alignItems: 'center' }, productIcon: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.primaryLight, alignItems: 'center', justifyContent: 'center' }, productInfo: { flex: 1, marginLeft: spacing.md }, productName: { ...typography.heading3, color: colors.text }, quantity: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs }, summary: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }, summaryLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 }, summaryValue: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' }, total: { ...typography.heading2, color: colors.primary }, cancellationStatus: { marginTop: spacing.md, gap: spacing.xs }, cancellationHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm }, cancellationNote: { ...typography.caption, color: colors.textSecondary }, cancelButton: { marginTop: spacing.md }, warningBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: '#FBF1DF', padding: spacing.md, borderWidth: 1, borderColor: '#F5D9A0' }, warningText: { ...typography.caption, color: colors.warning, flex: 1 }, demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' }, demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 }, modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg }, modalCard: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md }, modalTitle: { ...typography.heading3, color: colors.text }, modalDescription: { ...typography.bodySmall, color: colors.textSecondary }, modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm }, modalButton: { flex: 1 },
});
