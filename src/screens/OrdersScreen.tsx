import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Clipboard, Image, KeyboardAvoidingView, Modal, Platform, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { AppBadge, AppButton, AppCard, AppHeader, AppInput, AppScreen } from '../components/ui';
import { listMyOrders, OrderServiceError } from '../services/orders';
import { isBillingIdentityTestAvailable, registerBillingIdentity } from '../services/billingIdentity';
import { provisionAsaasSandboxCustomer } from '../services/asaasCustomerProvisioning';
import { createPixPayment } from '../services/asaasPayments';
import { cancelPendingOrder, PendingOrderCancellationServiceError } from '../services/pendingOrderCancellation';
import { requestOrderCancellation } from '../services/cancellationRequests';
import { listMyCancellationRequests } from '../services/cancellationRequestQueries';
import { CancellationRequestServiceError } from '../types/cancellationRequests';
import type { CancellationRequestQuery } from '../types/cancellationRequestQueries';
import type { Order, OrderStatus } from '../types/orders';
import { AsaasPaymentError } from '../types/asaasPayments';
import type { CreatePixPaymentResponse } from '../types/asaasPayments';
import type { PixCheckoutParams } from './PixCheckoutScreen';
import { orderItemNames, sortOrderItems, totalOrderUnits } from '../services/orderPresentation';
import { colors, layout, radius, spacing, typography } from '../theme/tokens';
import { cancellationUiFixtures, createFixtureCancellationRequest, fixtureRequestsByOrder, isGemnUiFixturesEnabled, ordersUiFixtures } from '../dev/ordersUiFixtures';

type OrdersScreenProps = {
  navigation?: { goBack: () => void; navigate?: (screen: 'PixCheckout', params: PixCheckoutParams) => void };
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

function friendlyPixError(error: unknown) {
  if (error instanceof AsaasPaymentError) {
    if (error.code === 'PAYMENT_ALREADY_IN_PROGRESS') return 'Já existe uma tentativa de pagamento em andamento para este pedido.';
    if (error.code === 'PAYMENT_NEEDS_RECONCILIATION') return 'Este pagamento precisa ser reconciliado antes de uma nova tentativa.';
    if (error.code === 'PAYMENT_ALREADY_CREATED') return 'Já existe uma cobrança Pix para este pedido.';
    if (error.code === 'ORDER_NOT_ELIGIBLE') return 'Este pedido não está elegível para pagamento Pix.';
    if (error.code === 'ASAAS_REJECTED') return 'O Asaas recusou a criação da cobrança Pix.';
    if (error.code === 'ASAAS_UNAVAILABLE') return 'O serviço de pagamentos está temporariamente indisponível.';
    if (error.code === 'ASAAS_TIMEOUT') return 'Não foi possível confirmar a cobrança Pix. Não tente novamente automaticamente.';
    return error.message;
  }
  return 'Não foi possível gerar a cobrança Pix. Tente novamente.';
}

function isPixEligible(order: Order) {
  return order.status === 'pendente' && Number.isFinite(order.valorDevidoReal) && order.valorDevidoReal > 0;
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
  const [billingTestOrders, setBillingTestOrders] = useState<Order[]>([]);
  const [billingTestOrder, setBillingTestOrder] = useState<Order | null>(null);
  const [billingTestModalOpen, setBillingTestModalOpen] = useState(false);
  const [billingTestDocument, setBillingTestDocument] = useState('');
  const [billingTestProcessing, setBillingTestProcessing] = useState(false);
  const [billingTestError, setBillingTestError] = useState<string | null>(null);
  const [billingTestResult, setBillingTestResult] = useState<string | null>(null);
  const [provisioningTestModalOpen, setProvisioningTestModalOpen] = useState(false);
  const [provisioningTestProcessing, setProvisioningTestProcessing] = useState(false);
  const [provisioningTestError, setProvisioningTestError] = useState<string | null>(null);
  const [provisioningTestResult, setProvisioningTestResult] = useState<string | null>(null);
  const [pixOrder, setPixOrder] = useState<Order | null>(null);
  const [pixPayment, setPixPayment] = useState<CreatePixPaymentResponse | null>(null);
  const [pixProcessing, setPixProcessing] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixCopied, setPixCopied] = useState(false);
  const [expandedOrderIds, setExpandedOrderIds] = useState<Record<string, boolean>>({});
  const intentKeysRef = useRef<Record<string, string>>({});
  const pendingIntentKeysRef = useRef<Record<string, string>>({});
  const pixIntentKeysRef = useRef<Record<string, string>>({});
  const fixturesEnabled = isGemnUiFixturesEnabled();

  function toggleOrderDetails(orderId: string) {
    setExpandedOrderIds((current) => ({ ...current, [orderId]: !current[orderId] }));
  }

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
    setBillingTestError(null);
    setBillingTestResult(null);
    setProvisioningTestError(null);
    setProvisioningTestResult(null);
    if (isBillingIdentityTestAvailable()) setBillingTestOrders([]);
    if (fixturesEnabled) {
      setOrders(ordersUiFixtures);
      setBillingTestOrders([]);
      await loadCancellationRequests();
      if (refresh) setRefreshing(false); else setLoading(false);
      return ordersUiFixtures;
    }
    let loadedOrders: Order[];
    try {
      const result = await listMyOrders();
      setOrders(result);
      if (isBillingIdentityTestAvailable()) {
        setBillingTestOrders(result.filter((order) => order.status === 'pendente' && order.valorDevidoReal > 0));
      }
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

  function openBillingTestModal() {
    if (!billingTestOrder) return;
    setBillingTestModalOpen(true);
    setBillingTestDocument('');
    setBillingTestError(null);
    setBillingTestResult(null);
  }

  async function submitBillingIdentityTest() {
    if (!billingTestOrder || billingTestProcessing) return;
    const document = billingTestDocument.trim();
    if (!document) {
      setBillingTestError('Informe um CPF/CNPJ exclusivamente de homologação.');
      return;
    }
    setBillingTestProcessing(true);
    setBillingTestError(null);
    setBillingTestResult(null);
    try {
      const result = await registerBillingIdentity(billingTestOrder.id, document);
      setBillingTestResult(result.outcome === 'created' ? 'Cadastro de homologação concluído.' : 'Identidade de homologação já cadastrada.');
      setBillingTestModalOpen(false);
      setBillingTestOrder(null);
    } catch (error) {
      setBillingTestError(error instanceof Error ? error.message : 'Não foi possível concluir o cadastro de homologação.');
    } finally {
      setBillingTestDocument('');
      setBillingTestProcessing(false);
    }
  }

  function openProvisioningTestModal() {
    if (!billingTestOrder || provisioningTestProcessing) return;
    setProvisioningTestModalOpen(true);
    setProvisioningTestError(null);
    setProvisioningTestResult(null);
  }

  async function submitProvisioningTest() {
    if (!billingTestOrder || provisioningTestProcessing) return;
    if (billingTestOrder.status !== 'pendente' || billingTestOrder.valorDevidoReal <= 0) {
      setProvisioningTestError('Selecione um pedido pendente elegível para a homologação.');
      return;
    }
    setProvisioningTestProcessing(true);
    setProvisioningTestError(null);
    setProvisioningTestResult(null);
    try {
      const result = await provisionAsaasSandboxCustomer();
      setProvisioningTestResult(result.outcome === 'created' ? 'Cliente de teste criado no Asaas Sandbox.' : 'Cliente de teste já existente reutilizado.');
      setProvisioningTestModalOpen(false);
    } catch (error) {
      setProvisioningTestError(error instanceof Error ? error.message : 'Não foi possível concluir o provisionamento do cliente de teste.');
    } finally {
      setProvisioningTestProcessing(false);
    }
  }

  async function submitPixPayment(order: Order) {
    if (!isPixEligible(order) || pixProcessing) return;
    const idempotencyKey = pixIntentKeysRef.current[order.id] ?? Crypto.randomUUID();
    pixIntentKeysRef.current[order.id] = idempotencyKey;
    setPixOrder(order);
    setPixPayment(null);
    setPixError(null);
    setPixCopied(false);
    setPixProcessing(true);
    try {
      const result = await createPixPayment({ orderId: order.id, idempotencyKey });
      setPixPayment(result);
    } catch (error) {
      setPixError(friendlyPixError(error));
    } finally {
      setPixProcessing(false);
    }
  }

  function closePixModal() {
    if (pixProcessing) return;
    setPixOrder(null);
    setPixPayment(null);
    setPixError(null);
    setPixCopied(false);
  }

  async function copyPixCode() {
    const payload = pixPayment?.qrCode.payload;
    if (!payload) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
      } else {
        Clipboard.setString(payload);
      }
      setPixCopied(true);
    } catch {
      setPixCopied(false);
    }
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
            const orderedItems = sortOrderItems(order.items);
            const item = orderedItems[0];
            const expanded = expandedOrderIds[order.id] === true;
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
                    <Text style={styles.productName}>{orderItemNames(orderedItems)}</Text>
                      <Text style={styles.quantity}>Quantidade total: {totalOrderUnits(orderedItems)} unidade{totalOrderUnits(orderedItems) === 1 ? '' : 's'}</Text>
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
                  <AppButton title={expanded ? 'Ocultar detalhes' : 'Ver detalhes do pedido'} variant="outline" size="compact" onPress={() => toggleOrderDetails(order.id)} />
                  {expanded ? <OrderDetails order={order} items={orderedItems} /> : null}
                  {order.status === 'pendente' ? <Text style={styles.pendingNote}>Pedido pendente não significa pagamento realizado.</Text> : null}
                  {isPixEligible(order) ? <AppButton title="Pagar com Pix" variant="primary" fullWidth onPress={() => navigation?.navigate ? navigation.navigate('PixCheckout', { orderId: order.id, itemName: orderItemNames(order.items), quantidade: totalOrderUnits(order.items), totalReal: order.totalReal, gemnUtilizado: order.gemnUtilizado, valorDevidoReal: order.valorDevidoReal }) : void submitPixPayment(order)} disabled={pixProcessing} loading={pixProcessing && pixOrder?.id === order.id} style={styles.pixButton} /> : null}
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
      {!loading && !errorMessage && isBillingIdentityTestAvailable() ? <BillingIdentityTestCard
        orders={billingTestOrders}
        selectedOrder={billingTestOrder}
        resultMessage={billingTestResult}
        errorMessage={billingTestError}
        onSelect={setBillingTestOrder}
        onOpen={openBillingTestModal}
        provisioningProcessing={provisioningTestProcessing}
        provisioningResultMessage={provisioningTestResult}
        provisioningErrorMessage={provisioningTestError}
        onProvisioningOpen={openProvisioningTestModal}
      /> : null}
      <PendingCancellationModal order={pendingSelectedOrder} processing={pendingCancellationProcessing} errorMessage={pendingCancellationError} onCancel={closePendingCancellationModal} onConfirm={() => { void submitPendingCancellation(); }} />
      <CancellationModal order={selectedOrder} reason={reason} processing={requestProcessing} errorMessage={requestError} onReasonChange={setReason} onCancel={closeCancellationModal} onConfirm={() => { void submitCancellationRequest(); }} />
      <BillingIdentityTestModal
        order={billingTestOrder}
        open={billingTestModalOpen}
        document={billingTestDocument}
        processing={billingTestProcessing}
        errorMessage={billingTestError}
        onDocumentChange={setBillingTestDocument}
        onCancel={() => { if (!billingTestProcessing) { setBillingTestModalOpen(false); setBillingTestOrder(null); setBillingTestDocument(''); setBillingTestError(null); } }}
        onConfirm={() => { void submitBillingIdentityTest(); }}
      />
      <ProvisioningTestModal
        open={provisioningTestModalOpen}
        processing={provisioningTestProcessing}
        errorMessage={provisioningTestError}
        onCancel={() => { if (!provisioningTestProcessing) { setProvisioningTestModalOpen(false); setProvisioningTestError(null); } }}
        onConfirm={() => { void submitProvisioningTest(); }}
      />
      <PixPaymentModal
        order={pixOrder}
        payment={pixPayment}
        processing={pixProcessing}
        errorMessage={pixError}
        copied={pixCopied}
        onCopy={() => { void copyPixCode(); }}
        onClose={closePixModal}
      />
    </AppScreen>
  );
}

function OrderDetails({ order, items }: { order: Order; items: Order['items'] }) {
  const cashbackLabel = order.status === 'concluido' ? 'Cashback creditado' : 'Cashback estimado';
  return <View style={styles.details}>
    <Text style={styles.detailsTitle}>Detalhes do pedido</Text>
    {items.map((item) => <View key={item.id} style={styles.detailItem}>
      <View style={styles.detailItemHeader}><OrderProductThumbnail imageUrl={item.imagemPrincipalUrl} name={item.nomeItem} /><Text style={styles.detailItemName}>{item.nomeItem}</Text></View>
      <Text style={styles.detailText}>{item.quantidade} × {formatReal(item.precoRealUnitario)} = {formatReal(item.subtotalReal)}</Text>
      <Text style={styles.detailText}>GEMN utilizado: {formatGemn(item.gemnUtilizadoItem)}</Text>
      <Text style={styles.detailText}>{cashbackLabel}: {formatReal(item.cashbackPrevisto)}</Text>
    </View>)}
    <View style={styles.detailTotals}>
      <Text style={styles.detailText}>Status: {statusLabels[order.status]}</Text>
      <Text style={styles.detailText}>Valor devido em reais: {formatReal(order.valorDevidoReal)}</Text>
      <Text style={styles.detailText}>GEMN utilizado no pedido: {formatGemn(order.gemnUtilizado)}</Text>
      <Text style={styles.detailText}>{cashbackLabel}: {formatReal(items.reduce((total, item) => total + item.cashbackPrevisto, 0))}</Text>
    </View>
  </View>;
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

function BillingIdentityTestCard({ orders, selectedOrder, resultMessage, errorMessage, onSelect, onOpen, provisioningProcessing, provisioningResultMessage, provisioningErrorMessage, onProvisioningOpen }: {
  orders: Order[];
  selectedOrder: Order | null;
  resultMessage: string | null;
  errorMessage: string | null;
  onSelect: (order: Order) => void;
  onOpen: () => void;
  provisioningProcessing: boolean;
  provisioningResultMessage: string | null;
  provisioningErrorMessage: string | null;
  onProvisioningOpen: () => void;
}) {
  return <AppCard style={styles.billingTestCard}>
    <View style={styles.billingTestHeader}>
      <MaterialCommunityIcons name="flask-outline" size={22} color={colors.warning} />
      <View style={styles.billingTestCopy}>
        <Text style={styles.infoTitle}>Homologação de identidade de cobrança</Text>
        <Text style={styles.infoText}>Ações temporárias DEV. Não criam cobrança ou pagamento; o provisionamento pode criar ou reutilizar um cliente de teste no Asaas Sandbox.</Text>
      </View>
    </View>
    {orders.length === 0 ? <Text style={styles.infoText}>Nenhum pedido pendente elegível encontrado.</Text> : <>
      <Text style={styles.billingTestLabel}>Selecione explicitamente um pedido:</Text>
      <View style={styles.billingTestOrderList}>
        {orders.map((order, index) => <AppButton
          key={order.id}
          title={selectedOrder?.id === order.id ? `Pedido ${index + 1} selecionado` : `Selecionar pedido ${index + 1}`}
          variant={selectedOrder?.id === order.id ? 'secondary' : 'outline'}
          onPress={() => onSelect(order)}
          size="compact"
        />)}
      </View>
      <AppButton title="Cadastrar identidade de homologação" onPress={onOpen} disabled={!selectedOrder} />
      <AppButton title="Provisionar cliente no Asaas Sandbox" onPress={onProvisioningOpen} disabled={!selectedOrder || provisioningProcessing} loading={provisioningProcessing} />
    </>}
    {resultMessage ? <Text style={styles.billingTestSuccess}>{resultMessage}</Text> : null}
    {errorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{errorMessage}</Text> : null}
    {provisioningResultMessage ? <Text style={styles.billingTestSuccess}>{provisioningResultMessage}</Text> : null}
    {provisioningErrorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{provisioningErrorMessage}</Text> : null}
  </AppCard>;
}

function ProvisioningTestModal({ open, processing, errorMessage, onCancel, onConfirm }: {
  open: boolean;
  processing: boolean;
  errorMessage: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal visible={open} transparent animationType="fade" onRequestClose={onCancel}>
    <View accessibilityViewIsModal style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Confirmar provisionamento?</Text>
        <Text style={styles.modalDescription}>Esta ação poderá criar ou reutilizar um cliente de teste no Asaas Sandbox. Nenhuma cobrança ou pagamento será criado.</Text>
        {errorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{errorMessage}</Text> : null}
        <View style={styles.modalActions}>
          <AppButton title="Cancelar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} />
          <AppButton title="Confirmar provisionamento" onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} />
        </View>
      </View>
    </View>
  </Modal>;
}

function BillingIdentityTestModal({ order, open, document, processing, errorMessage, onDocumentChange, onCancel, onConfirm }: {
  order: Order | null;
  open: boolean;
  document: string;
  processing: boolean;
  errorMessage: string | null;
  onDocumentChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return <Modal visible={Boolean(order && open)} transparent animationType="fade" onRequestClose={onCancel}>
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalBackdrop}>
      <View accessibilityViewIsModal style={styles.modalCard}>
        <Text style={styles.modalTitle}>Confirmar teste de homologação?</Text>
        <Text style={styles.modalDescription}>O documento será usado somente nesta chamada e não será persistido pelo aplicativo.</Text>
        <AppInput
          label="CPF/CNPJ fictício de homologação"
          value={document}
          onChangeText={onDocumentChange}
          placeholder="Somente dado de teste"
          keyboardType="numeric"
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={18}
          error={errorMessage ?? undefined}
          autoFocus
        />
        <View style={styles.modalActions}>
          <AppButton title="Cancelar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} />
          <AppButton title="Confirmar envio" onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} />
        </View>
      </View>
    </KeyboardAvoidingView>
  </Modal>;
}

function PixPaymentModal({ order, payment, processing, errorMessage, copied, onCopy, onClose }: {
  order: Order | null;
  payment: CreatePixPaymentResponse | null;
  processing: boolean;
  errorMessage: string | null;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const encodedImage = payment?.qrCode.encodedImage;
  const qrSource = encodedImage ? { uri: encodedImage.startsWith('data:') ? encodedImage : `data:image/png;base64,${encodedImage}` } : null;
  return <Modal visible={Boolean(order)} transparent animationType="fade" onRequestClose={onClose}>
    <View accessibilityViewIsModal style={styles.modalBackdrop}>
      <View style={styles.modalCard}>
        <Text style={styles.modalTitle}>Pagamento Pix</Text>
        <Text style={styles.modalDescription}>{order ? `Pedido ${order.id}` : ''}</Text>
        {processing ? <View style={styles.pixLoading}><ActivityIndicator color={colors.brand} /><Text style={styles.feedbackText}>Gerando cobrança Pix...</Text></View> : null}
        {errorMessage ? <Text accessibilityRole="alert" style={styles.modalError}>{errorMessage}</Text> : null}
        {payment ? <>
          <Text style={styles.pixReadyTitle}>Cobrança Pix pronta</Text>
          {qrSource ? <Image accessibilityLabel="QR Code para pagamento Pix" source={qrSource} style={styles.pixQrCode} /> : <Text style={styles.feedbackText}>O QR Code visual não está disponível, mas o código Pix pode ser copiado abaixo.</Text>}
          {payment.qrCode.payload ? <>
            <Text style={styles.pixCodeLabel}>Código Pix copia e cola</Text>
            <Text selectable style={styles.pixPayload}>{payment.qrCode.payload}</Text>
            <AppButton title={copied ? 'Código copiado' : 'Copiar código Pix'} variant="secondary" fullWidth onPress={onCopy} disabled={copied} />
          </> : <Text accessibilityRole="alert" style={styles.modalError}>O código Pix não foi disponibilizado. Não realize o pagamento por esta tela.</Text>}
          <Text style={styles.pixSecurityNote}>Esta etapa não confirma o pedido nem credita cashback.</Text>
        </> : null}
        <View style={styles.modalActions}>
          <AppButton title="Fechar" variant="outline" onPress={onClose} disabled={processing} style={styles.modalButton} />
        </View>
      </View>
    </View>
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
  pixButton: { marginTop: spacing.sm },
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
  details: { marginTop: spacing.sm, padding: spacing.md, gap: spacing.sm, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  detailsTitle: { ...typography.label, color: colors.text },
  detailItem: { gap: spacing.xs, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailItemHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  detailItemName: { ...typography.label, color: colors.text, flex: 1 },
  detailText: { ...typography.caption, color: colors.textSecondary },
  detailTotals: { gap: spacing.xs, paddingTop: spacing.xs },
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
  pixLoading: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  pixReadyTitle: { ...typography.label, color: colors.success, textAlign: 'center' },
  pixQrCode: { alignSelf: 'center', width: 220, height: 220, backgroundColor: colors.white },
  pixCodeLabel: { ...typography.label, color: colors.text },
  pixPayload: { ...typography.caption, color: colors.textSecondary, maxHeight: 96, padding: spacing.sm, backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  pixSecurityNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.sm },
  modalButton: { flex: 1 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.gemnLight, borderWidth: 1, borderColor: colors.gemnLight },
  demoBannerText: { ...typography.caption, color: colors.warning, flex: 1 },
  billingTestCard: { gap: spacing.md, borderWidth: 1, borderColor: colors.gemnLight, backgroundColor: colors.surface },
  billingTestHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  billingTestCopy: { flex: 1, gap: spacing.xs },
  billingTestLabel: { ...typography.bodySmall, color: colors.textSecondary },
  billingTestOrderList: { gap: spacing.sm },
  billingTestSuccess: { ...typography.bodySmall, color: colors.success },
});
