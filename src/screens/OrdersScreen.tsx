import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { AppBadge, AppButton, AppCard, AppHeader, AppInput, AppScreen } from '../components/ui';
import { listMyOrders, OrderServiceError } from '../services/orders';
import { cancelPendingOrder, PendingOrderCancellationServiceError } from '../services/pendingOrderCancellation';
import { requestOrderCancellation } from '../services/cancellationRequests';
import { listMyCancellationRequests } from '../services/cancellationRequestQueries';
import { CancellationRequestServiceError } from '../types/cancellationRequests';
import type { CancellationRequestQuery } from '../types/cancellationRequestQueries';
import type { Order, OrderStatus } from '../types/orders';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';
import { cancellationUiFixtures, createFixtureCancellationRequest, fixtureRequestsByOrder, isGemnUiFixturesEnabled, ordersUiFixtures } from '../dev/ordersUiFixtures';

type OrdersScreenProps = {
  navigation?: { goBack: () => void };
};

const statusLabels: Record<OrderStatus, string> = {
  pendente: 'Pendente',
  confirmado: 'Confirmado',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
  expirado: 'Expirado',
};

function statusPresentation(status: OrderStatus) {
  if (status === 'pendente') return { icon: 'clock-outline' as const, color: colors.warning, style: styles.statusPending, textStyle: styles.statusTextPending };
  if (status === 'cancelado') return { icon: 'close-circle-outline' as const, color: colors.error, style: styles.statusCancelled, textStyle: styles.statusTextCancelled };
  if (status === 'expirado') return { icon: 'timer-off-outline' as const, color: colors.error, style: styles.statusExpired, textStyle: styles.statusTextExpired };
  if (status === 'concluido') return { icon: 'check-circle' as const, color: colors.success, style: styles.status, textStyle: styles.statusText };
  return { icon: 'progress-check' as const, color: colors.brand, style: styles.status, textStyle: styles.statusTextConfirmed };
}

function formatReal(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatGemn(value: number | null) {
  return value === null ? 'Não aplicável' : `${value.toLocaleString('pt-BR')} GEMN`;
}

function orderTotal(order: Order) {
  return order.formaPagamento === 'gemn' ? formatGemn(order.gemnUtilizado) : formatReal(order.valorDevidoReal);
}

function paymentLabel(order: Order) {
  return order.formaPagamento === 'gemn' ? '100% GEMN' : order.formaPagamento === 'misto' ? 'Misto' : 'Reais';
}

function friendlyOrdersError(error: unknown) {
  if (error instanceof OrderServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível carregar seus pedidos. Tente novamente.';
}

function friendlyCancellationError(error: unknown) {
  if (error instanceof CancellationRequestServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível atualizar as solicitações de cancelamento.';
}

function friendlyPendingCancellationError(error: unknown) {
  if (error instanceof PendingOrderCancellationServiceError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Não foi possível cancelar o pedido. Tente novamente.';
}

function OrderProductThumbnail({ imageUrl, name }: { imageUrl?: string; name: string }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <View style={styles.productThumbnail} accessibilityLabel={imageUrl && !imageFailed ? `Imagem de ${name}` : `Imagem indisponível de ${name}`}>
      {imageUrl && !imageFailed ? (
        <Image
          accessibilityLabel={`Imagem de ${name}`}
          source={{ uri: imageUrl }}
          style={styles.productThumbnailImage}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={styles.productThumbnailPlaceholder}>
          <MaterialCommunityIcons name="image-outline" size={26} color={colors.brand} />
        </View>
      )}
    </View>
  );
}

function latestRequestsByOrder(requests: CancellationRequestQuery[]) {
  return requests.reduce<Record<string, CancellationRequestQuery>>((result, request) => {
    const current = result[request.orderId];
    if (!current || new Date(request.atualizadoEm).getTime() >= new Date(current.atualizadoEm).getTime()) result[request.orderId] = request;
    return result;
  }, {});
}

function requestStatusPresentation(request: CancellationRequestQuery | undefined) {
  if (!request) return null;
  if (request.status === 'pendente') return { label: 'Aguardando análise', variant: 'warning' as const, icon: 'clock-outline' as const };
  if (request.status === 'aprovada') return { label: 'Aprovada', variant: 'success' as const, icon: 'check-circle-outline' as const };
  if (request.status === 'rejeitada') return { label: 'Rejeitada', variant: 'neutral' as const, icon: 'close-circle-outline' as const };
  return { label: 'Em análise administrativa', variant: 'warning' as const, icon: 'alert-circle-outline' as const };
}

export default function OrdersScreen({ navigation }: OrdersScreenProps) {
  const { width } = useWindowDimensions();
  const wide = width >= layout.breakpoints.tablet;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cancellationRequests, setCancellationRequests] = useState<Record<string, CancellationRequestQuery>>({});
  const [cancellationError, setCancellationError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [reason, setReason] = useState('');
  const [requestError, setRequestError] = useState<string | null>(null);
  const [requestProcessing, setRequestProcessing] = useState(false);
  const [inconclusiveMessage, setInconclusiveMessage] = useState<string | null>(null);
  const [pendingSelectedOrder, setPendingSelectedOrder] = useState<Order | null>(null);
  const [pendingCancellationProcessing, setPendingCancellationProcessing] = useState(false);
  const [pendingCancellationError, setPendingCancellationError] = useState<string | null>(null);
  const intentKeysRef = useRef<Record<string, string>>({});
  const pendingIntentKeysRef = useRef<Record<string, string>>({});
  const fixturesEnabled = isGemnUiFixturesEnabled();

  const loadCancellationRequests = useCallback(async () => {
    if (fixturesEnabled) {
      setCancellationRequests(fixtureRequestsByOrder());
      setCancellationError(null);
      return cancellationUiFixtures;
    }
    try {
      const requests = await listMyCancellationRequests();
      setCancellationRequests(latestRequestsByOrder(requests));
      setCancellationError(null);
      return requests;
    } catch (error) {
      setCancellationError(friendlyCancellationError(error));
      return null;
    }
  }, [fixturesEnabled]);

  const loadOrders = useCallback(async (refresh = false): Promise<Order[] | null> => {
    if (refresh) setRefreshing(true); else setLoading(true);
    setErrorMessage(null);
    setInconclusiveMessage(null);
    if (fixturesEnabled) {
      setOrders(ordersUiFixtures);
      await loadCancellationRequests();
      if (refresh) setRefreshing(false); else setLoading(false);
      return ordersUiFixtures;
    }
    let loadedOrders: Order[];
    try {
      const result = await listMyOrders();
      setOrders(result);
      loadedOrders = result;
    } catch (error) {
      setErrorMessage(friendlyOrdersError(error));
      return null;
    } finally {
      if (refresh) setRefreshing(false); else setLoading(false);
    }
    await loadCancellationRequests();
    return loadedOrders;
  }, [fixturesEnabled, loadCancellationRequests]);

  useFocusEffect(useCallback(() => {
    void loadOrders();
  }, [loadOrders]));

  function openCancellationModal(order: Order) {
    const request = cancellationRequests[order.id];
    if (order.status !== 'confirmado' || request?.status === 'pendente' || request?.status === 'execucao_falhou' || request?.status === 'aprovada') return;
    if (!intentKeysRef.current[order.id]) intentKeysRef.current[order.id] = Crypto.randomUUID();
    setSelectedOrder(order);
    setReason('');
    setRequestError(null);
    setInconclusiveMessage(null);
  }

  function closeCancellationModal() {
    if (requestProcessing) return;
    if (selectedOrder) delete intentKeysRef.current[selectedOrder.id];
    setSelectedOrder(null);
    setReason('');
    setRequestError(null);
  }

  function openPendingCancellationModal(order: Order) {
    if (order.status !== 'pendente') return;
    if (!pendingIntentKeysRef.current[order.id]) pendingIntentKeysRef.current[order.id] = Crypto.randomUUID();
    setPendingSelectedOrder(order);
    setPendingCancellationError(null);
    setInconclusiveMessage(null);
  }

  function closePendingCancellationModal() {
    if (pendingCancellationProcessing) return;
    if (pendingSelectedOrder) delete pendingIntentKeysRef.current[pendingSelectedOrder.id];
    setPendingSelectedOrder(null);
    setPendingCancellationError(null);
  }

  async function submitPendingCancellation() {
    if (!pendingSelectedOrder || pendingCancellationProcessing) return;
    const orderId = pendingSelectedOrder.id;
    const idempotencyKey = pendingIntentKeysRef.current[orderId] ?? Crypto.randomUUID();
    pendingIntentKeysRef.current[orderId] = idempotencyKey;
    setPendingCancellationProcessing(true);
    setPendingCancellationError(null);
    setInconclusiveMessage(null);
    try {
      const result = await cancelPendingOrder({ orderId, idempotencyKey });
      delete pendingIntentKeysRef.current[orderId];
      setPendingSelectedOrder(null);
      await loadOrders(true);
      setInconclusiveMessage(
        result.gemnLiberado > 0
          ? `Pedido cancelado. ${formatGemn(result.gemnLiberado)} reservado${result.gemnLiberado === 1 ? '' : 's'} foi devolvido à sua carteira.`
          : 'Pedido cancelado. Nenhum GEMN reservado precisava ser devolvido.',
      );
    } catch (error) {
      const serviceError = error instanceof PendingOrderCancellationServiceError ? error : null;
      if (serviceError?.kind === 'network' || serviceError?.retryable) {
        const refreshed = await loadOrders(true);
        const currentOrder = refreshed?.find((current) => current.id === orderId);
        if (currentOrder?.status === 'cancelado') {
          delete pendingIntentKeysRef.current[orderId];
          setPendingSelectedOrder(null);
          setInconclusiveMessage('O pedido foi cancelado. Atualizamos a lista; consulte a carteira para conferir a devolução dos GEMN reservados.');
        } else if (currentOrder && currentOrder.status !== 'pendente') {
          delete pendingIntentKeysRef.current[orderId];
          setPendingSelectedOrder(null);
          setInconclusiveMessage(`O pedido não pode mais ser cancelado porque está ${statusLabels[currentOrder.status].toLocaleLowerCase()}.`);
        } else {
          setPendingCancellationError(friendlyPendingCancellationError(error));
          setInconclusiveMessage('O resultado do cancelamento ficou inconclusivo. O pedido continua disponível para consulta e a mesma chave será reutilizada se você tentar novamente.');
        }
      } else {
        const refreshed = await loadOrders(true);
        const currentOrder = refreshed?.find((current) => current.id === orderId);
        if (currentOrder && currentOrder.status !== 'pendente') {
          delete pendingIntentKeysRef.current[orderId];
          setPendingSelectedOrder(null);
          setInconclusiveMessage(friendlyPendingCancellationError(error));
        } else {
          setPendingCancellationError(friendlyPendingCancellationError(error));
        }
      }
    } finally {
      setPendingCancellationProcessing(false);
    }
  }

  async function submitCancellationRequest() {
    if (!selectedOrder || requestProcessing) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setRequestError('Informe o motivo do cancelamento.');
      return;
    }
    const orderId = selectedOrder.id;
    const idempotencyKey = intentKeysRef.current[orderId] ?? Crypto.randomUUID();
    intentKeysRef.current[orderId] = idempotencyKey;
    setRequestProcessing(true);
    setRequestError(null);
    setInconclusiveMessage(null);
    try {
      if (fixturesEnabled) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        setCancellationRequests((current) => ({ ...current, [orderId]: createFixtureCancellationRequest(orderId, trimmedReason) }));
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
      await loadCancellationRequests();
    } catch (error) {
      const serviceError = error instanceof CancellationRequestServiceError ? error : null;
      if (serviceError?.kind === 'network' || serviceError?.retryable) {
        const refreshed = await loadCancellationRequests();
        const currentRequest = refreshed?.find((request) => request.orderId === orderId);
        if (!currentRequest) setInconclusiveMessage('Não foi possível confirmar o resultado. Atualizamos as solicitações; verifique o status antes de tentar novamente. A mesma intenção será reutilizada em um novo envio.');
        else setSelectedOrder(null);
      } else {
        setRequestError(friendlyCancellationError(error));
      }
    } finally {
      setRequestProcessing(false);
    }
  }

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <AppHeader
        title="Meus pedidos"
        subtitle="Acompanhe suas compras na comunidade"
        onBack={() => navigation?.goBack()}
        action={<TouchableOpacity accessibilityRole="button" accessibilityLabel="Atualizar pedidos" accessibilityState={{ busy: refreshing, disabled: loading || refreshing }} style={styles.refreshButton} disabled={loading || refreshing} onPress={() => { void loadOrders(true); }}><MaterialCommunityIcons name="refresh" size={21} color={loading || refreshing ? colors.textMuted : colors.brand} /></TouchableOpacity>}
      />
      {fixturesEnabled ? <View style={styles.demoBanner} accessibilityRole="text">
        <MaterialCommunityIcons name="flask-outline" size={18} color={colors.warning} />
        <Text style={styles.demoBannerText}>Modo de demonstração · dados sintéticos locais</Text>
      </View> : null}

      {loading ? (
        <View style={styles.feedbackState}>
          <ActivityIndicator color={colors.brand} />
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
          <MaterialCommunityIcons name="clipboard-text-outline" size={42} color={colors.brand} />
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
                    <OrderProductThumbnail imageUrl={item?.imagemPrincipalUrl} name={item?.nomeItem ?? 'item do pedido'} />
                    <View style={styles.productInfo}>
                    <Text style={styles.productName}>{item?.nomeItem ?? 'Item do pedido'}{order.items.length > 1 ? ` + ${order.items.length - 1} item(ns)` : ''}</Text>
                      <Text style={styles.quantity}>Quantidade: {item?.quantidade ?? order.items.reduce((sum, current) => sum + current.quantidade, 0)}</Text>
                    </View>
                  </View>

                  <View style={styles.summary}>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Forma escolhida</Text>
                      <Text style={styles.summaryValue}>{paymentLabel(order)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{order.formaPagamento === 'gemn' ? 'Total em GEMN' : 'Devido em reais'}</Text>
                      <Text style={styles.total}>{orderTotal(order)}</Text>
                    </View>
                    {order.gemnUtilizado > 0 ? <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>GEMN utilizado</Text>
                      <Text style={styles.summaryValue}>{formatGemn(order.gemnUtilizado)}</Text>
                    </View> : null}
                  </View>
                  {order.status === 'pendente' ? <Text style={styles.pendingNote}>Pedido pendente não significa pagamento realizado.</Text> : null}
                  {requestStatusPresentation(cancellationRequests[order.id]) ? (() => {
                    const requestStatus = requestStatusPresentation(cancellationRequests[order.id])!;
                    const request = cancellationRequests[order.id];
                    return <View style={styles.cancellationStatus}>
                      <View style={styles.cancellationStatusHeader}>
                        <MaterialCommunityIcons name={requestStatus.icon} size={18} color={colors.brand} />
                        <AppBadge label={requestStatus.label} variant={requestStatus.variant} />
                      </View>
                      {request?.status === 'rejeitada' && request.motivoDecisao ? <Text style={styles.cancellationNote}>Motivo: {request.motivoDecisao}</Text> : null}
                    </View>;
                  })() : null}
                  {order.status === 'pendente' ? <AppButton title="Cancelar pedido" variant="outline" fullWidth onPress={() => openPendingCancellationModal(order)} style={styles.cancelButton} /> : null}
                  {order.status === 'confirmado' && (!cancellationRequests[order.id] || cancellationRequests[order.id].status === 'rejeitada') ? <AppButton title="Solicitar cancelamento" variant="outline" fullWidth onPress={() => openCancellationModal(order)} style={styles.cancelButton} /> : null}
                </AppCard>
              </View>
            );
          })}
        </View>
      )}

      {!loading && !errorMessage && orders.length > 0 ? <AppCard style={styles.infoBox}>
        <View style={styles.infoIcon}><MaterialCommunityIcons name="information-outline" size={20} color={colors.brand} /></View>
        <View style={styles.infoCopy}>
          <Text style={styles.infoTitle}>Seu histórico GEMN</Text>
          <Text style={styles.infoText}>Pedidos pendentes representam uma intenção registrada. Pagamentos e débitos GEMN não são realizados nesta etapa.</Text>
        </View>
      </AppCard> : null}
      {!loading && !errorMessage && cancellationError ? <AppCard style={styles.warningBox}>
        <MaterialCommunityIcons name="alert-outline" size={20} color={colors.warning} />
        <Text style={styles.warningBoxText}>{cancellationError}</Text>
      </AppCard> : null}
      {inconclusiveMessage ? <AppCard style={styles.warningBox}>
        <MaterialCommunityIcons name="cloud-question" size={20} color={colors.warning} />
        <Text style={styles.warningBoxText}>{inconclusiveMessage}</Text>
      </AppCard> : null}
      <PendingCancellationModal order={pendingSelectedOrder} processing={pendingCancellationProcessing} errorMessage={pendingCancellationError} onCancel={closePendingCancellationModal} onConfirm={() => { void submitPendingCancellation(); }} />
      <CancellationModal order={selectedOrder} reason={reason} processing={requestProcessing} errorMessage={requestError} onReasonChange={setReason} onCancel={closeCancellationModal} onConfirm={() => { void submitCancellationRequest(); }} />
    </AppScreen>
  );
}

function PendingCancellationModal({ order, processing, errorMessage, onCancel, onConfirm }: {
  order: Order | null;
  processing: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}>
    <View accessibilityViewIsModal style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Cancelar pedido?</Text>
        <Text style={styles.modalDescription}>Pedido {order?.id}</Text>
        <Text style={styles.modalDescription}>Esta ação cancela a intenção pendente. Se houver GEMN reservado, o valor será devolvido à sua carteira.</Text>
        {errorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{errorMessage}</Text> : null}
        <View style={styles.modalActions}>
          <AppButton title="Voltar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} />
          <AppButton title="Confirmar cancelamento" onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} />
        </View>
      </View>
    </View>
  </Modal>;
}

function CancellationModal({ order, reason, processing, errorMessage, onReasonChange, onCancel, onConfirm }: {
  order: Order | null;
  reason: string;
  processing: boolean;
  errorMessage: string | null;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onCancel}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
      <View accessibilityViewIsModal style={styles.modalCard}>
        <Text style={styles.modalTitle}>Solicitar cancelamento</Text>
        <Text style={styles.modalDescription}>Pedido {order?.id}</Text>
        <Text style={styles.modalDescription}>Informe o motivo para que a solicitação seja analisada pela equipe GEMN.</Text>
        <AppInput label="Motivo do cancelamento" value={reason} onChangeText={onReasonChange} placeholder="Descreva o motivo" multiline maxLength={1000} error={errorMessage ?? undefined} autoFocus />
        <View style={styles.modalActions}>
          <AppButton title="Voltar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} />
          <AppButton title="Confirmar solicitação" onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl, gap: spacing.md },
  refreshButton: { width: 44, height: 44, borderRadius: radius.full, alignItems: 'center', justifyContent: 'center' },
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
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.sm, minHeight: 28, borderRadius: radius.full, backgroundColor: colors.brandLight },
  statusPending: { backgroundColor: colors.gemnLight },
  statusCancelled: { backgroundColor: colors.surfaceMuted },
  statusExpired: { backgroundColor: colors.surfaceMuted },
  statusText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  statusTextPending: { color: colors.warning },
  statusTextConfirmed: { color: colors.brand },
  statusTextCancelled: { color: colors.error },
  statusTextExpired: { color: colors.error },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  productRow: { flexDirection: 'row', alignItems: 'center' },
  productThumbnail: { width: 64, height: 64, borderRadius: radius.md, overflow: 'hidden', backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border, flexShrink: 0 },
  productThumbnailImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  productThumbnailPlaceholder: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandLight },
  productInfo: { flex: 1, marginLeft: spacing.md },
  productName: { ...typography.heading3, color: colors.text },
  quantity: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.xs },
  summary: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border, gap: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  summaryValue: { ...typography.caption, color: colors.textSecondary, fontWeight: '600' },
  total: { ...typography.heading2, color: colors.brandDark },
  pendingNote: { ...typography.caption, color: colors.warning, marginTop: spacing.md },
  infoBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.brandLight, padding: spacing.md, borderWidth: 1, borderColor: colors.brandLight },
  infoIcon: { width: 38, height: 38, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  infoCopy: { flex: 1, marginLeft: spacing.md, gap: spacing.xs },
  infoTitle: { ...typography.label, color: colors.text },
  infoText: { ...typography.caption, color: colors.textSecondary },
  cancelButton: { marginTop: spacing.md },
  cancellationStatus: { marginTop: spacing.md, gap: spacing.xs },
  cancellationStatusHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cancellationNote: { ...typography.caption, color: colors.textSecondary },
  warningBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.gemnLight, padding: spacing.md, borderWidth: 1, borderColor: colors.gemnLight },
  warningBoxText: { ...typography.caption, color: colors.warning, flex: 1 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modalCard: { width: '100%', maxWidth: 480, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { ...typography.heading3, color: colors.text },
  modalDescription: { ...typography.bodySmall, color: colors.textSecondary },
  modalError: { ...typography.bodySmall, color: colors.error },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gemnLight, borderWidth: 1, borderColor: colors.gemnLight },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
});
