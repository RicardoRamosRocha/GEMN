import React from 'react';
import { ActivityIndicator, Modal, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';

import { AppBadge, AppButton, AppCard, AppInput, AppScreen } from '../components/ui';
import { listAdminCancellationRequests, listCancellationRequestAttempts } from '../services/cancellationRequestQueries';
import { approveOrderCancellationRequest, rejectOrderCancellationRequest } from '../services/cancellationRequests';
import type { CancellationRequestAttempt, CancellationRequestQuery } from '../types/cancellationRequestQueries';
import { CancellationRequestServiceError, type CancellationRequestStatus } from '../types/cancellationRequests';
import { AccessDenied } from './AdminHomeScreen';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { approveAdminCancellationFixture, isAdminCancellationUiFixturesEnabled, listAdminCancellationFixtureAttempts, listAdminCancellationFixtureRequests, rejectAdminCancellationFixture } from '../dev/adminCancellationUiFixtures';

type Decision = 'approve' | 'reject';

function statusLabel(status: CancellationRequestStatus): string {
  return status === 'pendente' ? 'Pendente' : status === 'execucao_falhou' ? 'Execução falhou' : status === 'aprovada' ? 'Aprovada' : 'Rejeitada';
}

function statusVariant(status: CancellationRequestStatus): 'neutral' | 'success' | 'warning' {
  return status === 'aprovada' ? 'success' : status === 'pendente' || status === 'execucao_falhou' ? 'warning' : 'neutral';
}

function isRetryable(error: unknown): boolean {
  return error instanceof CancellationRequestServiceError && error.retryable;
}

export default function AdminCancellationRequestDetailScreen({ route }: any) {
  const { width } = useWindowDimensions();
  const requestId = route?.params?.requestId as string | undefined;
  const [request, setRequest] = React.useState<CancellationRequestQuery | null>(null);
  const [attempts, setAttempts] = React.useState<CancellationRequestAttempt[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [processing, setProcessing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState('');
  const [accessDenied, setAccessDenied] = React.useState(false);
  const [inconclusive, setInconclusive] = React.useState(false);
  const [decision, setDecision] = React.useState<Decision | null>(null);
  const [rejectionReason, setRejectionReason] = React.useState('');
  const decisionKeys = React.useRef<Record<string, string>>({});

  const load = React.useCallback(async () => {
    if (!requestId) { setErrorMessage('Solicitação não encontrada.'); setLoading(false); return; }
    setLoading(true); setErrorMessage(''); setAccessDenied(false);
    try {
      const [allRequests, requestAttempts] = isAdminCancellationUiFixturesEnabled()
        ? [listAdminCancellationFixtureRequests(), listAdminCancellationFixtureAttempts(requestId)]
        : await Promise.all([listAdminCancellationRequests(), listCancellationRequestAttempts(requestId)]);
      setRequest(allRequests.find((item) => item.requestId === requestId) ?? null);
      setAttempts(requestAttempts);
    } catch (error) {
      setAccessDenied(error instanceof CancellationRequestServiceError && (error.kind === 'auth' || error.kind === 'authorization'));
      setErrorMessage(error instanceof CancellationRequestServiceError ? error.message : 'Não foi possível carregar os detalhes.');
    } finally { setLoading(false); }
  }, [requestId]);

  useFocusEffect(React.useCallback(() => { load(); }, [load]));

  function beginDecision(next: Decision) {
    if (!request || processing || (request.status !== 'pendente' && request.status !== 'execucao_falhou')) return;
    setDecision(next);
    if (next === 'reject') setRejectionReason('');
  }

  async function confirmDecision() {
    if (!request || !decision || processing) return;
    if (decision === 'reject' && rejectionReason.trim().length < 3) { setErrorMessage('Informe o motivo da rejeição.'); return; }
    setProcessing(true); setErrorMessage(''); setInconclusive(false);
    const keyName = `${request.requestId}:${decision}`;
    const idempotencyKey = decisionKeys.current[keyName] ?? Crypto.randomUUID();
    decisionKeys.current[keyName] = idempotencyKey;
    try {
      if (decision === 'approve') {
        const result = isAdminCancellationUiFixturesEnabled()
          ? approveAdminCancellationFixture(request.requestId, idempotencyKey)
          : await approveOrderCancellationRequest({ requestId: request.requestId, idempotencyKey });
        if (result.status === 'execucao_falhou') {
          delete decisionKeys.current[keyName];
          setErrorMessage(result.erroMensagem || 'A execução financeira falhou. A solicitação permanece disponível para nova tentativa.');
        } else delete decisionKeys.current[keyName];
      } else {
        if (isAdminCancellationUiFixturesEnabled()) rejectAdminCancellationFixture(request.requestId, idempotencyKey, rejectionReason.trim());
        else await rejectOrderCancellationRequest({ requestId: request.requestId, idempotencyKey, motivo: rejectionReason.trim() });
        delete decisionKeys.current[keyName];
      }
      setDecision(null);
      await load();
    } catch (error) {
      if (isRetryable(error)) {
        setInconclusive(true);
        setErrorMessage(error instanceof Error ? error.message : 'A operação pode ter sido concluída. Consulte o status antes de repetir.');
        await load();
      } else setErrorMessage(error instanceof Error ? error.message : 'Não foi possível concluir a decisão.');
    } finally { setProcessing(false); }
  }

  if (loading && !request) return <AppScreen><ActivityIndicator color={colors.primary} style={styles.feedback} /></AppScreen>;
  if (accessDenied && !request && !loading) return <AccessDenied />;
  if (errorMessage && !request && !loading) return <AppScreen><Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text></AppScreen>;
  if (!request) return <AppScreen><Text style={styles.error}>Solicitação não encontrada.</Text></AppScreen>;
  const actionable = request.status === 'pendente' || request.status === 'execucao_falhou';

  return (
    <>
      <AppScreen scroll edges={['bottom']} contentContainerStyle={[styles.screen, width >= 760 && styles.screenWide]}>
        <View style={styles.heading}><View style={styles.headingCopy}><Text style={styles.eyebrow}>GEMN</Text><Text style={styles.title}>Detalhes do cancelamento</Text><Text style={styles.subtitle}>Pedido {request.orderId.slice(0, 8)}</Text></View><AppBadge label={statusLabel(request.status)} variant={statusVariant(request.status)} /></View>
        {isAdminCancellationUiFixturesEnabled() ? <View style={styles.demoBanner} accessibilityRole="text"><Text style={styles.demoBannerText}>Modo de demonstração — dados sintéticos locais</Text></View> : null}
        <AppCard style={styles.card}><Detail label="Solicitante" value={request.requesterRole} /><Detail label="Referência técnica" value={request.requestedBy} /><Detail label="Status do pedido" value={request.orderStatus} /><Detail label="Motivo da solicitação" value={request.motivoSolicitacao} /><Detail label="Criada em" value={new Date(request.criadoEm).toLocaleString('pt-BR')} /></AppCard>
        <AppCard style={styles.card}><Text style={styles.sectionTitle}>Resumo financeiro persistido</Text><Detail label="Total em reais" value={request.totalReal.toFixed(2)} /><Detail label="GEMN utilizado" value={request.gemnUtilizado.toFixed(2)} /><Detail label="Valor devido em reais" value={request.valorDevidoReal.toFixed(2)} /></AppCard>
        {request.motivoDecisao ? <AppCard style={styles.card}><Detail label="Motivo da decisão" value={request.motivoDecisao} /></AppCard> : null}
        {request.erroMensagem ? <Text accessibilityRole="alert" style={styles.error}>Falha anterior: {request.erroMensagem}</Text> : null}
        {inconclusive ? <Text accessibilityRole="alert" style={styles.warning}>Resultado inconclusivo: o status foi consultado novamente. Repita somente após confirmar o estado.</Text> : null}
        {errorMessage ? <Text accessibilityRole="alert" style={styles.error}>{errorMessage}</Text> : null}
        {actionable ? <View style={styles.actions}><AppButton title="Aprovar" onPress={() => beginDecision('approve')} loading={processing && decision === 'approve'} disabled={processing} style={styles.action} /><AppButton title="Rejeitar" variant="outline" onPress={() => beginDecision('reject')} disabled={processing} style={styles.action} /></View> : null}
        <Text style={styles.sectionTitle}>Histórico de tentativas</Text>
        {attempts.length === 0 ? <Text style={styles.muted}>Nenhuma tentativa registrada.</Text> : attempts.map((attempt) => <AppCard key={attempt.attemptId} style={styles.attempt}><Text style={styles.attemptTitle}>{attempt.operacao} · {attempt.resultado}</Text><Text style={styles.muted}>{new Date(attempt.criadoEm).toLocaleString('pt-BR')}</Text>{attempt.erroMensagem ? <Text style={styles.error}>{attempt.erroMensagem}</Text> : null}</AppCard>)}
      </AppScreen>
      <DecisionModal decision={decision} processing={processing} rejectionReason={rejectionReason} onReasonChange={setRejectionReason} onCancel={() => setDecision(null)} onConfirm={confirmDecision} />
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) { return <View style={styles.detail}><Text style={styles.detailLabel}>{label}</Text><Text style={styles.detailValue}>{value}</Text></View>; }

function DecisionModal({ decision, processing, rejectionReason, onReasonChange, onCancel, onConfirm }: { decision: Decision | null; processing: boolean; rejectionReason: string; onReasonChange: (value: string) => void; onCancel: () => void; onConfirm: () => void }) {
  if (!decision) return null;
  const approving = decision === 'approve';
  return <Modal visible transparent animationType="fade" onRequestClose={onCancel}><View style={styles.backdrop}><View accessibilityViewIsModal style={styles.modal}><Text style={styles.modalTitle}>{approving ? 'Aprovar solicitação?' : 'Rejeitar solicitação?'}</Text><Text style={styles.modalText}>{approving ? 'A aprovação iniciará o fluxo financeiro administrativo de estorno.' : 'A rejeição não altera saldos nem o status financeiro do pedido.'}</Text>{!approving ? <AppInput label="Motivo obrigatório" value={rejectionReason} onChangeText={onReasonChange} multiline placeholder="Explique a decisão" /> : null}<View style={styles.modalActions}><AppButton title="Voltar" variant="outline" onPress={onCancel} disabled={processing} style={styles.modalButton} /><AppButton title={approving ? 'Confirmar aprovação' : 'Confirmar rejeição'} onPress={onConfirm} loading={processing} disabled={processing} style={styles.modalButton} /></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  screen: { paddingTop: spacing.md, paddingBottom: spacing.xxl, gap: spacing.md },
  screenWide: { maxWidth: 880 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  headingCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.heading1, color: colors.text },
  subtitle: { ...typography.bodySmall, color: colors.textSecondary },
  card: { borderWidth: 1, borderColor: colors.border, gap: spacing.md },
  detail: { gap: spacing.xs },
  detailLabel: { ...typography.caption, color: colors.textSecondary },
  detailValue: { ...typography.body, color: colors.text },
  sectionTitle: { ...typography.heading3, color: colors.text },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  action: { minWidth: 150 },
  attempt: { borderWidth: 1, borderColor: colors.border, gap: spacing.xs },
  attemptTitle: { ...typography.label, color: colors.text },
  muted: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.bodySmall, color: colors.error },
  warning: { ...typography.bodySmall, color: colors.warning },
  feedback: { marginTop: spacing.xxl },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  modal: { width: '100%', maxWidth: 520, backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  modalTitle: { ...typography.heading3, color: colors.text },
  modalText: { ...typography.body, color: colors.textSecondary },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
  modalButton: { flex: 1, minWidth: 140 },
  demoBanner: { flexDirection: 'row', alignItems: 'center', padding: spacing.sm, borderRadius: radius.md, backgroundColor: '#FBF1DF', borderWidth: 1, borderColor: '#F5D9A0' },
  demoBannerText: { ...typography.caption, color: colors.warning },
});
