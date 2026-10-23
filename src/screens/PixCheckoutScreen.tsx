import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Clipboard, Image, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';

import { AppBadge, AppButton, AppCard, AppHeader, AppScreen } from '../components/ui';
import { createPixPayment } from '../services/asaasPayments';
import { getMyOrder } from '../services/orders';
import { getPixCheckoutVisualState } from '../services/pixCheckoutPresentation';
import type { CreatePixPaymentResponse } from '../types/asaasPayments';
import type { OrderStatus } from '../types/orders';
import { colors, layout, radius, shadows, spacing, typography } from '../theme/tokens';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_ATTEMPTS = 60;

export type PixCheckoutParams = {
  orderId: string;
  itemName: string;
  quantidade: number;
  totalReal: number;
  gemnUtilizado: number;
  valorDevidoReal: number;
};

type PixCheckoutScreenProps = {
  route?: { params?: PixCheckoutParams };
  navigation?: { goBack: () => void };
};

function formatReal(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function qrSource(payment: CreatePixPaymentResponse | null) {
  const encoded = payment?.qrCode.encodedImage;
  if (!encoded) return null;
  return { uri: encoded.startsWith('data:') ? encoded : `data:image/png;base64,${encoded}` };
}

function paymentError(error: unknown) {
  if (error instanceof Error) return error.message;
  return 'Não foi possível preparar o pagamento Pix.';
}

function isTerminalStatus(status?: OrderStatus) {
  return status === 'confirmado' || status === 'concluido' || status === 'cancelado' || status === 'expirado';
}

export default function PixCheckoutScreen({ route, navigation }: PixCheckoutScreenProps) {
  const { width } = useWindowDimensions();
  const params = route?.params;
  const wide = width >= layout.breakpoints.tablet;
  const [payment, setPayment] = useState<CreatePixPaymentResponse | null>(null);
  const [orderStatus, setOrderStatus] = useState<OrderStatus | undefined>();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [appActive, setAppActive] = useState(true);
  const [screenActive, setScreenActive] = useState(true);
  const idempotencyKeyRef = useRef<string | null>(null);
  const pollInFlightRef = useRef(false);
  const pollAttemptsRef = useRef(0);

  useFocusEffect(useCallback(() => {
    setScreenActive(true);
    return () => setScreenActive(false);
  }, []));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      setAppActive(nextState === 'active');
    });
    return () => subscription.remove();
  }, []);

  const refreshOrderStatus = useCallback(async () => {
    if (!params || !payment || !screenActive || !appActive || pollInFlightRef.current || isTerminalStatus(orderStatus)) return;
    if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
      setPollError('Não foi possível atualizar o status agora. Você pode consultar o pedido novamente mais tarde.');
      return;
    }

    pollInFlightRef.current = true;
    pollAttemptsRef.current += 1;
    setChecking(true);
    setPollError(null);
    try {
      const order = await getMyOrder(params.orderId);
      setOrderStatus(order.status);
    } catch (error) {
      setPollError(paymentError(error));
    } finally {
      pollInFlightRef.current = false;
      setChecking(false);
    }
  }, [appActive, orderStatus, params, payment, screenActive]);

  useEffect(() => {
    if (!payment || !appActive || !screenActive || isTerminalStatus(orderStatus) || pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) return;
    const timer = setInterval(() => { void refreshOrderStatus(); }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [appActive, orderStatus, payment, refreshOrderStatus, screenActive]);

  if (!params) return null;
  const checkoutParams: PixCheckoutParams = params;
  const hasPayment = Boolean(payment);
  const visualState = getPixCheckoutVisualState({
    orderStatus,
    hasPayment,
    isGenerating: loading,
    isChecking: checking,
    hasRecoverableError: Boolean(pollError),
  });

  async function generatePix() {
    if (loading || payment || orderStatus === 'cancelado' || orderStatus === 'expirado') return;
    setLoading(true);
    setErrorMessage(null);
    setPollError(null);
    setCopied(false);
    idempotencyKeyRef.current ??= Crypto.randomUUID();
    try {
      const result = await createPixPayment({ orderId: checkoutParams.orderId, idempotencyKey: idempotencyKeyRef.current });
      setPayment(result);
      pollAttemptsRef.current = 0;
    } catch (error) {
      setErrorMessage(paymentError(error));
    } finally {
      setLoading(false);
    }
  }

  async function copyPayload() {
    const payload = payment?.qrCode.payload;
    if (!payload) return;
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) await navigator.clipboard.writeText(payload);
      else Clipboard.setString(payload);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  const qr = qrSource(payment);
  const statusLabel = visualState === 'confirmed'
    ? 'Pagamento confirmado'
    : visualState === 'cancelled'
      ? 'Pedido cancelado'
      : visualState === 'expired'
        ? 'Pedido expirado'
        : visualState === 'generating'
          ? 'Gerando Pix'
          : visualState === 'checking_payment'
            ? 'Consultando pagamento'
            : visualState === 'error'
              ? 'Atualização indisponível'
              : hasPayment ? 'Aguardando pagamento' : 'Pronto para gerar';
  const statusVariant = visualState === 'confirmed' ? 'success' : visualState === 'error' || visualState === 'cancelled' || visualState === 'expired' ? 'warning' : hasPayment ? 'warning' : 'neutral';
  const statusIcon = visualState === 'confirmed' ? 'check-circle' : visualState === 'cancelled' || visualState === 'expired' ? 'alert-circle-outline' : hasPayment ? 'clock-outline' : 'arrow-down-circle-outline';
  const terminal = isTerminalStatus(orderStatus);

  return (
    <AppScreen scroll edges={['top', 'right', 'bottom', 'left']} contentContainerStyle={styles.content}>
      <AppHeader title="Checkout Pix" subtitle="Pagamento seguro pelo GEMN" onBack={() => navigation?.goBack()} />
      <View style={[styles.container, wide && styles.containerWide]}>
        <AppCard style={styles.secureBanner}>
          <View style={styles.secureIcon}><MaterialCommunityIcons name="shield-check-outline" size={22} color={colors.brand} /></View>
          <View style={styles.secureCopy}>
            <Text style={styles.secureTitle}>Ambiente protegido</Text>
            <Text style={styles.secureText}>A cobrança só é criada quando você solicitar a geração do QR Code.</Text>
          </View>
        </AppCard>

        <View style={[styles.columns, wide && styles.columnsWide]}>
          <AppCard elevated={wide} style={styles.summaryCard}>
            <View style={styles.sectionHeading}><MaterialCommunityIcons name="receipt-text-outline" size={22} color={colors.brand} /><Text style={styles.sectionTitle}>Resumo do pedido</Text></View>
            <Text style={styles.itemName}>{checkoutParams.itemName}</Text>
            <Text style={styles.itemMeta}>Quantidade: {checkoutParams.quantidade}</Text>
            <View style={styles.divider} />
            <SummaryRow label="Total da compra" value={formatReal(checkoutParams.totalReal)} />
            <SummaryRow label="GEMN utilizado" value={`${checkoutParams.gemnUtilizado.toFixed(2)} GEMN`} accent="gemn" />
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Restante em reais</Text><Text style={styles.totalValue}>{formatReal(checkoutParams.valorDevidoReal)}</Text></View>
            <Text style={styles.orderId}>Pedido {checkoutParams.orderId}</Text>
          </AppCard>

          <AppCard elevated={wide} style={styles.pixCard}>
            <View style={styles.pixHeading}><View style={styles.pixIcon}><MaterialCommunityIcons name="qrcode" size={26} color={colors.white} /></View><View style={styles.pixHeadingCopy}><Text style={styles.sectionTitle}>Pix</Text><Text style={styles.pixDescription}>Pague usando o QR Code ou o código copia e cola.</Text></View></View>
            <View style={styles.statusLine}><AppBadge label={statusLabel} variant={statusVariant} /><MaterialCommunityIcons name={statusIcon} size={20} color={visualState === 'confirmed' ? colors.success : visualState === 'error' || terminal ? colors.error : hasPayment ? colors.warning : colors.brand} /></View>

            {loading ? <View style={styles.feedback}><ActivityIndicator color={colors.brand} /><Text style={styles.feedbackText}>Preparando o QR Code Pix...</Text></View> : null}
            {checking ? <Text style={styles.feedbackText}>Consultando o status do pedido no GEMN...</Text> : null}
            {!loading && !hasPayment && !terminal ? <View style={styles.qrPlaceholder}><MaterialCommunityIcons name="qrcode-scan" size={58} color={colors.borderStrong} /><Text style={styles.placeholderTitle}>Seu QR Code aparecerá aqui</Text><Text style={styles.feedbackText}>Nenhuma cobrança foi criada ainda.</Text></View> : null}
            {!loading && qr ? <Image accessibilityLabel="QR Code para pagamento Pix" source={qr} style={styles.qrImage} /> : null}
            {!loading && hasPayment && !qr ? <Text style={styles.feedbackText}>O QR Code visual não está disponível. Use o código copia e cola abaixo.</Text> : null}

            {payment?.qrCode.payload ? <View style={styles.payloadArea}><Text style={styles.payloadLabel}>Código Pix copia e cola</Text><Text selectable numberOfLines={4} style={styles.payload}>{payment.qrCode.payload}</Text><AppButton title={copied ? 'Código copiado' : 'Copiar código Pix'} variant="secondary" fullWidth onPress={() => { void copyPayload(); }} disabled={copied} /></View> : null}
            {errorMessage || pollError ? <View style={styles.errorBox}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text accessibilityRole="alert" style={styles.errorText}>{errorMessage ?? pollError}</Text></View> : null}
            {visualState === 'confirmed' ? <View style={styles.confirmedBox}><MaterialCommunityIcons name="check-circle" size={24} color={colors.success} /><Text style={styles.confirmedText}>Pagamento confirmado pelo GEMN. Consulte o pedido para ver os detalhes.</Text></View> : null}
            {visualState === 'cancelled' || visualState === 'expired' ? <View style={styles.errorBox}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.error} /><Text style={styles.errorText}>Este pedido não aceita mais pagamento Pix.</Text></View> : null}

            {!hasPayment && !terminal ? <AppButton title="Gerar QR Code Pix" fullWidth onPress={() => { void generatePix(); }} loading={loading} disabled={loading} /> : null}
            <Text style={styles.securityNote}>A confirmação acontece automaticamente após a validação do pagamento. Não confirme manualmente nesta tela.</Text>
          </AppCard>
        </View>

        <View style={styles.footerActions}>
          <AppButton title="Consultar pedido" variant="outline" fullWidth onPress={() => navigation?.goBack()} />
        </View>
      </View>
    </AppScreen>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: 'gemn' }) {
  return <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={[styles.summaryValue, accent === 'gemn' && styles.gemnValue]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  content: { paddingTop: spacing.xs, paddingBottom: spacing.xxl + spacing.lg },
  container: { width: '100%', maxWidth: 620, alignSelf: 'center', gap: spacing.md },
  containerWide: { maxWidth: 980, gap: spacing.lg },
  secureBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.brandLight, borderColor: colors.borderStrong },
  secureIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  secureCopy: { flex: 1, gap: spacing.xs },
  secureTitle: { ...typography.label, color: colors.brandDark },
  secureText: { ...typography.caption, color: colors.textSecondary },
  columns: { gap: spacing.md },
  columnsWide: { flexDirection: 'row', alignItems: 'flex-start' },
  summaryCard: { flex: 1, gap: spacing.sm, padding: spacing.mdLg },
  pixCard: { flex: 1, gap: spacing.md, borderColor: colors.brandLight },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.heading3, color: colors.text },
  itemName: { ...typography.heading2, color: colors.brandDark, marginTop: spacing.sm },
  itemMeta: { ...typography.caption, color: colors.textSecondary },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  summaryLabel: { ...typography.bodySmall, color: colors.textSecondary, flex: 1 },
  summaryValue: { ...typography.label, color: colors.text },
  gemnValue: { color: colors.gemn },
  totalRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  totalLabel: { ...typography.heading4, color: colors.text },
  totalValue: { ...typography.heading2, color: colors.brandDark, fontSize: 24, lineHeight: 30 },
  orderId: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm, opacity: 0.8, letterSpacing: 0.1 },
  pixHeading: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  pixIcon: { width: 48, height: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand },
  pixHeadingCopy: { flex: 1, gap: spacing.xs },
  pixDescription: { ...typography.caption, color: colors.textSecondary },
  statusLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  feedback: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xl },
  feedbackText: { ...typography.bodySmall, color: colors.textSecondary, textAlign: 'center' },
  qrPlaceholder: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.border },
  placeholderTitle: { ...typography.heading4, color: colors.text },
  qrImage: { alignSelf: 'center', width: 220, height: 220, backgroundColor: colors.white, ...shadows.subtle },
  payloadArea: { gap: spacing.sm },
  payloadLabel: { ...typography.label, color: colors.text },
  payload: { ...typography.caption, color: colors.textSecondary, padding: spacing.sm, maxHeight: 96, backgroundColor: colors.surfaceMuted, borderRadius: radius.md },
  errorBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FFF1F1', borderWidth: 1, borderColor: colors.error },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  confirmedBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.brandLight },
  confirmedText: { ...typography.bodySmall, color: colors.success, flex: 1 },
  securityNote: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  footerActions: { marginTop: spacing.xs, paddingBottom: spacing.md },
});
