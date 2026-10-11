import { supabase } from '../lib/supabase';
import { CancellationRequestServiceError } from '../types/cancellationRequests';
import type {
  ApproveCancellationResult,
  CancellationRequestResult,
  CancellationRequesterRole,
  CancellationRequestStatus,
  DecideCancellationParams,
  RejectCancellationParams,
  RejectCancellationResult,
  RequestCancellationParams,
} from '../types/cancellationRequests';

export { CancellationRequestServiceError } from '../types/cancellationRequests';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (isRecord(error) && typeof error.message === 'string') return error.message.toLowerCase();
  return String(error).toLowerCase();
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function normalizeError(error: unknown): CancellationRequestServiceError {
  const message = errorMessage(error);
  const code = errorCode(error);
  const rawMessage = isRecord(error) && typeof error.message === 'string' ? error.message : undefined;

  if (code === 'PGRST301' || code === '42501' || message.includes('not authenticated') || message.includes('permission denied')) {
    return new CancellationRequestServiceError('auth', 'É necessário estar autenticado para acessar esta operação.', code);
  }

  if (code === 'P0001') {
    if (message.includes('administrador') || message.includes('admin')) {
      return new CancellationRequestServiceError('authorization', rawMessage ?? 'Apenas administradores podem decidir solicitações.', code);
    }
    if (message.includes('motivo') || message.includes('inval') || message.includes('vazio')) {
      return new CancellationRequestServiceError('validation', rawMessage ?? 'Revise os dados informados.', code);
    }
    if (message.includes('idempot') || message.includes('duplic') || message.includes('pendente') || message.includes('status') || message.includes('conflito')) {
      return new CancellationRequestServiceError('conflict', rawMessage ?? 'A solicitação não pode ser processada neste estado.', code);
    }
    if (message.includes('falhou') || message.includes('financeiro') || message.includes('depend')) {
      return new CancellationRequestServiceError('recoverable', rawMessage ?? 'A execução financeira falhou e pode ser reprocessada.', code, true);
    }
    return new CancellationRequestServiceError('unexpected', rawMessage ?? 'Não foi possível concluir a operação.', code);
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new CancellationRequestServiceError(
      'network',
      'Não foi possível conectar ao GEMN. A operação pode ter sido concluída; consulte o status antes de repetir.',
      code,
      true,
    );
  }

  return new CancellationRequestServiceError('unexpected', 'Não foi possível concluir a operação.', code);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new CancellationRequestServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function decimalNumber(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new CancellationRequestServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  }
  return result;
}

function requestStatus(value: unknown): CancellationRequestStatus {
  if (value === 'pendente' || value === 'aprovada' || value === 'rejeitada' || value === 'execucao_falhou') return value;
  throw new CancellationRequestServiceError('unexpected', 'Retorno inválido: estado de solicitação desconhecido.');
}

function requesterRole(value: unknown): CancellationRequesterRole {
  if (value === 'comprador' || value === 'vendedor') return value;
  throw new CancellationRequestServiceError('unexpected', 'Retorno inválido: papel do solicitante desconhecido.');
}

function singleRow(data: unknown): UnknownRecord {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new CancellationRequestServiceError('unexpected', 'A RPC retornou um formato inesperado.');
  }
  return data[0];
}

function normalizeRequest(data: unknown): CancellationRequestResult {
  const row = singleRow(data);
  return {
    requestId: requiredString(row.request_id, 'request_id'),
    orderId: requiredString(row.order_id, 'order_id'),
    status: requestStatus(row.status),
    requesterRole: requesterRole(row.requester_role),
    requesterSellerId: nullableString(row.requester_seller_id, 'requester_seller_id'),
    motivoSolicitacao: requiredString(row.motivo_solicitacao, 'motivo_solicitacao'),
    criadoEm: requiredString(row.criado_em, 'criado_em'),
  };
}

function normalizeApproval(data: unknown): ApproveCancellationResult {
  const row = singleRow(data);
  return {
    requestId: requiredString(row.request_id, 'request_id'),
    orderId: requiredString(row.order_id, 'order_id'),
    status: requestStatus(row.status),
    attemptId: requiredString(row.attempt_id, 'attempt_id'),
    orderCancellationId: nullableString(row.order_cancellation_id, 'order_cancellation_id'),
    gemnEstornado: decimalNumber(row.gemn_estornado, 'gemn_estornado'),
    cashbackRetirado: decimalNumber(row.cashback_retirado, 'cashback_retirado'),
    cashbackDividaCriada: decimalNumber(row.cashback_divida_criada, 'cashback_divida_criada'),
    cashbackDividaRestaurada: decimalNumber(row.cashback_divida_restaurada, 'cashback_divida_restaurada'),
    erroCodigo: nullableString(row.erro_codigo, 'erro_codigo'),
    erroMensagem: nullableString(row.erro_mensagem, 'erro_mensagem'),
  };
}

function normalizeRejection(data: unknown): RejectCancellationResult {
  const row = singleRow(data);
  if (row.status !== 'rejeitada') {
    throw new CancellationRequestServiceError('unexpected', 'Retorno inválido: rejeição sem estado rejeitada.');
  }
  return {
    requestId: requiredString(row.request_id, 'request_id'),
    orderId: requiredString(row.order_id, 'order_id'),
    status: 'rejeitada',
    attemptId: requiredString(row.attempt_id, 'attempt_id'),
    motivoDecisao: requiredString(row.motivo_decisao, 'motivo_decisao'),
  };
}

async function requireAuthenticatedUser(): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new CancellationRequestServiceError('auth', 'É necessário estar autenticado para acessar esta operação.');
}

export async function requestOrderCancellation(params: RequestCancellationParams): Promise<CancellationRequestResult> {
  await requireAuthenticatedUser();
  const { data, error } = await supabase.rpc('request_order_cancellation', {
    p_order_id: params.orderId,
    p_idempotency_key: params.idempotencyKey,
    p_motivo: params.motivo,
  });
  if (error) throw normalizeError(error);
  return normalizeRequest(data);
}

export async function approveOrderCancellationRequest(params: DecideCancellationParams): Promise<ApproveCancellationResult> {
  await requireAuthenticatedUser();
  const { data, error } = await supabase.rpc('approve_order_cancellation_request', {
    p_request_id: params.requestId,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw normalizeError(error);
  return normalizeApproval(data);
}

export async function rejectOrderCancellationRequest(params: RejectCancellationParams): Promise<RejectCancellationResult> {
  await requireAuthenticatedUser();
  const { data, error } = await supabase.rpc('reject_order_cancellation_request', {
    p_request_id: params.requestId,
    p_idempotency_key: params.idempotencyKey,
    p_motivo: params.motivo,
  });
  if (error) throw normalizeError(error);
  return normalizeRejection(data);
}
