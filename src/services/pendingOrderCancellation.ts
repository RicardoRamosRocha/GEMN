import { supabase } from '../lib/supabase';
import {
  PendingOrderCancellationServiceError,
  type PendingOrderCancellationParams,
  type PendingOrderCancellationResult,
} from '../types/pendingOrderCancellation';

export { PendingOrderCancellationServiceError } from '../types/pendingOrderCancellation';

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

function normalizeError(error: unknown): PendingOrderCancellationServiceError {
  const code = errorCode(error);
  const message = errorMessage(error);
  const rawMessage = isRecord(error) && typeof error.message === 'string' ? error.message : undefined;

  if (code === 'PGRST301' || message.includes('not authenticated') || message.includes('jwt')) {
    return new PendingOrderCancellationServiceError('auth', 'É necessário estar autenticado para cancelar este pedido.', code);
  }

  if (code === '42501' || message.includes('permission denied') || message.includes('não pode cancelar') || message.includes('nao pode cancelar')) {
    return new PendingOrderCancellationServiceError('authorization', rawMessage ?? 'Você não tem autorização para cancelar este pedido.', code);
  }

  if (code === 'P0001' && (
    message.includes('expirado')
    || message.includes('somente pedidos pendentes')
    || message.includes('já foi cancelado')
    || message.includes('ja foi cancelado')
    || message.includes('processado concorrentemente')
  )) {
    return new PendingOrderCancellationServiceError('conflict', rawMessage ?? 'O pedido não pode mais ser cancelado.', code);
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new PendingOrderCancellationServiceError(
      'network',
      'Não foi possível confirmar o cancelamento. Consulte o status do pedido antes de tentar novamente.',
      code,
      true,
    );
  }

  return new PendingOrderCancellationServiceError('unexpected', rawMessage ?? 'Não foi possível cancelar o pedido.', code);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PendingOrderCancellationServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function decimalNumber(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new PendingOrderCancellationServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  }
  return result;
}

function singleRow(data: unknown): UnknownRecord {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new PendingOrderCancellationServiceError('unexpected', 'O cancelamento retornou um formato inesperado.');
  }
  return data[0];
}

function normalizeResult(data: unknown): PendingOrderCancellationResult {
  const row = singleRow(data);
  const status = requiredString(row.status, 'status');
  if (status !== 'cancelado') {
    throw new PendingOrderCancellationServiceError('unexpected', 'O cancelamento retornou um status inesperado.');
  }
  return {
    orderId: requiredString(row.order_id, 'order_id'),
    status,
    gemnLiberado: decimalNumber(row.gemn_liberado, 'gemn_liberado'),
    canceladoPor: requiredString(row.cancelado_por, 'cancelado_por'),
  };
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new PendingOrderCancellationServiceError('auth', 'É necessário estar autenticado para cancelar este pedido.');
}

export async function cancelPendingOrder(params: PendingOrderCancellationParams): Promise<PendingOrderCancellationResult> {
  await requireAuthenticatedUser();
  const { data, error } = await supabase.rpc('cancel_pending_order', {
    p_order_id: params.orderId,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw normalizeError(error);
  return normalizeResult(data);
}

export const __pendingOrderCancellationTestables = {
  normalizeError,
  normalizeResult,
};
