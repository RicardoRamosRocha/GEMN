import type { CancellationRequestAttempt, CancellationRequestQuery } from '../types/cancellationRequestQueries';
import type { ApproveCancellationResult, RejectCancellationResult } from '../types/cancellationRequests';

const buyerId = '00000000-0000-4000-8000-000000000011';
const adminId = '00000000-0000-4000-8000-000000000012';
const createdAt = '2026-01-15T12:00:00.000Z';

function enabled() {
  return __DEV__ === true && process.env.EXPO_PUBLIC_GEMN_UI_FIXTURES === 'true';
}

function request(orderId: string, status: CancellationRequestQuery['status'], decisionReason: string | null = null): CancellationRequestQuery {
  return {
    requestId: `${orderId}-request`,
    orderId,
    requestedBy: buyerId,
    requesterRole: 'comprador',
    requesterSellerId: null,
    motivoSolicitacao: 'Motivo sintético para demonstração administrativa.',
    status,
    decisionIdempotencyKey: status === 'pendente' ? null : `${orderId}-decision`,
    decidedBy: status === 'pendente' ? null : adminId,
    motivoDecisao: decisionReason,
    orderCancellationId: status === 'aprovada' ? `${orderId}-cancellation` : null,
    erroCodigo: status === 'execucao_falhou' ? 'SIMULATED_FAILURE' : null,
    erroMensagem: status === 'execucao_falhou' ? 'Falha administrativa sintética para demonstração.' : null,
    orderStatus: 'confirmado',
    totalReal: 125,
    gemnUtilizado: 0,
    valorDevidoReal: 125,
    orderCriadoEm: createdAt,
    criadoEm: createdAt,
    atualizadoEm: createdAt,
    decididoEm: status === 'pendente' ? null : createdAt,
  };
}

let requests: CancellationRequestQuery[] = [
  request('00000000-0000-4000-8000-000000000301', 'pendente'),
  request('00000000-0000-4000-8000-000000000302', 'execucao_falhou'),
  request('00000000-0000-4000-8000-000000000303', 'aprovada', 'Aprovada em demonstração local.'),
  request('00000000-0000-4000-8000-000000000304', 'rejeitada', 'Motivo insuficiente para aprovação.'),
];

const attemptsByRequest: Record<string, CancellationRequestAttempt[]> = Object.fromEntries(
  requests.map((item) => [item.requestId, item.status === 'execucao_falhou' ? [{
    attemptId: `${item.requestId}-attempt`,
    requestId: item.requestId,
    operacao: 'aprovar',
    resultado: 'falhou',
    orderCancellationId: null,
    erroCodigo: item.erroCodigo,
    erroMensagem: item.erroMensagem,
    criadoEm: createdAt,
    finalizadoEm: createdAt,
  }] : []]),
);

export function isAdminCancellationUiFixturesEnabled() {
  return enabled();
}

export function listAdminCancellationFixtureRequests(status?: CancellationRequestQuery['status']) {
  return requests.filter((item) => !status || item.status === status);
}

export function listAdminCancellationFixtureAttempts(requestId: string) {
  return attemptsByRequest[requestId] ?? [];
}

function addAttempt(requestItem: CancellationRequestQuery, operation: string, result: string, key: string, errorCode: string | null = null, errorMessage: string | null = null) {
  attemptsByRequest[requestItem.requestId] ??= [];
  attemptsByRequest[requestItem.requestId].push({
    attemptId: `${requestItem.requestId}-${operation}-${key}`,
    requestId: requestItem.requestId,
    operacao: operation,
    resultado: result,
    orderCancellationId: requestItem.orderCancellationId,
    erroCodigo: errorCode,
    erroMensagem: errorMessage,
    criadoEm: new Date().toISOString(),
    finalizadoEm: new Date().toISOString(),
  });
}

export function approveAdminCancellationFixture(requestId: string, idempotencyKey: string): ApproveCancellationResult {
  const item = requests.find((candidate) => candidate.requestId === requestId);
  if (!item) throw new Error('Solicitação sintética não encontrada.');
  if (item.status === 'aprovada') return { requestId, orderId: item.orderId, status: item.status, attemptId: `${requestId}-approved`, orderCancellationId: item.orderCancellationId, gemnEstornado: 0, cashbackRetirado: 0, cashbackDividaCriada: 0, cashbackDividaRestaurada: 0, erroCodigo: null, erroMensagem: null };
  item.status = 'aprovada';
  item.decisionIdempotencyKey = idempotencyKey;
  item.decidedBy = adminId;
  item.orderCancellationId = `${item.orderId}-cancellation`;
  item.motivoDecisao = 'Aprovada em demonstração local.';
  item.atualizadoEm = new Date().toISOString();
  item.decididoEm = item.atualizadoEm;
  item.erroCodigo = null;
  item.erroMensagem = null;
  addAttempt(item, 'aprovar', 'sucesso', idempotencyKey);
  return { requestId, orderId: item.orderId, status: item.status, attemptId: `${requestId}-approved`, orderCancellationId: item.orderCancellationId, gemnEstornado: 0, cashbackRetirado: 0, cashbackDividaCriada: 0, cashbackDividaRestaurada: 0, erroCodigo: null, erroMensagem: null };
}

export function rejectAdminCancellationFixture(requestId: string, idempotencyKey: string, motivo: string): RejectCancellationResult {
  const item = requests.find((candidate) => candidate.requestId === requestId);
  if (!item) throw new Error('Solicitação sintética não encontrada.');
  if (!motivo.trim()) throw new Error('Informe o motivo da rejeição.');
  item.status = 'rejeitada';
  item.decisionIdempotencyKey = idempotencyKey;
  item.decidedBy = adminId;
  item.motivoDecisao = motivo.trim();
  item.atualizadoEm = new Date().toISOString();
  item.decididoEm = item.atualizadoEm;
  item.erroCodigo = null;
  item.erroMensagem = null;
  addAttempt(item, 'rejeitar', 'sucesso', idempotencyKey);
  return { requestId, orderId: item.orderId, status: 'rejeitada', attemptId: `${requestId}-rejected`, motivoDecisao: item.motivoDecisao };
}
