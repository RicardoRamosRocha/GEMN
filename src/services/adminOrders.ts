import { supabase } from '../lib/supabase';
import type { AdminOrderConfirmation, AdminOrderServiceErrorKind, AdminPendingOrder } from '../types/adminOrders';
import { AdminOrderServiceError } from '../types/adminOrders';
import type { OrderStatus, PaymentMethod } from '../types/orders';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function requiredString(value: unknown, field: string): string { if (typeof value !== 'string' || value.trim() === '') throw new AdminOrderServiceError('unexpected', `Retorno inválido: ${field} ausente.`); return value; }
function nullableNumber(value: unknown, field: string): number | null { if (value === null) return null; return numberValue(value, field); }
function numberValue(value: unknown, field: string): number { const result = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(result)) throw new AdminOrderServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`); return result; }
function paymentMethod(value: unknown): PaymentMethod { if (value === 'real' || value === 'gemn' || value === 'misto') return value; throw new AdminOrderServiceError('unexpected', 'Retorno inválido: modalidade de pagamento desconhecida.'); }
function orderStatus(value: unknown): OrderStatus { if (value === 'pendente' || value === 'confirmado' || value === 'concluido' || value === 'cancelado' || value === 'expirado') return value; throw new AdminOrderServiceError('unexpected', 'Retorno inválido: status de pedido desconhecido.'); }
function rows(data: unknown): UnknownRecord[] { if (!Array.isArray(data) || !data.every(isRecord)) throw new AdminOrderServiceError('unexpected', 'A consulta administrativa retornou um formato inesperado.'); return data; }
function singleRow(data: unknown): UnknownRecord { const result = rows(data); if (result.length !== 1) throw new AdminOrderServiceError('unexpected', 'A confirmação retornou um formato inesperado.'); return result[0]; }
function errorDetails(error: unknown) { const record = isRecord(error) ? error : {}; return { code: typeof record.code === 'string' ? record.code : undefined, message: typeof record.message === 'string' ? record.message : String(error) }; }
function validatePagination(limit: number, offset: number) { if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AdminOrderServiceError('validation', 'O limite deve estar entre 1 e 100.'); if (!Number.isInteger(offset) || offset < 0) throw new AdminOrderServiceError('validation', 'O deslocamento não pode ser negativo.'); }

function normalizeError(error: unknown): AdminOrderServiceError {
  const { code, message: raw } = errorDetails(error);
  const message = raw.toLowerCase();
  if (code === 'PGRST301' || code === '42501' || message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) return new AdminOrderServiceError('auth', 'É necessário estar autenticado para acessar a administração.', code);
  if (code === 'P0001' && (message.includes('administrador') || message.includes('autorizado'))) return new AdminOrderServiceError('authorization', 'Apenas administradores podem consultar ou confirmar pedidos.', code);
  if (code === 'P0001' && (message.includes('expirado') || message.includes('24 horas'))) return new AdminOrderServiceError('expired', 'Este pedido ultrapassou o prazo de 24 horas e não pode ser confirmado.', code);
  if (code === 'P0001' && (message.includes('já foi confirmado') || message.includes('somente pedidos pendentes') || message.includes('reserva') || message.includes('consistente'))) return new AdminOrderServiceError('conflict', raw, code);
  if (code === 'P0001') return new AdminOrderServiceError('validation', raw, code);
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) return new AdminOrderServiceError('network', 'Não foi possível confirmar o resultado da operação. Consulte a fila antes de tentar novamente.', code, true);
  return new AdminOrderServiceError('unexpected', 'Não foi possível concluir a operação administrativa.', code);
}

function normalizePendingOrder(value: UnknownRecord): AdminPendingOrder {
  if (value.tipo !== 'produto' && value.tipo !== 'servico') throw new AdminOrderServiceError('unexpected', 'Retorno inválido: tipo de item desconhecido.');
  return {
    orderId: requiredString(value.order_id, 'order_id'), buyerId: requiredString(value.buyer_id, 'buyer_id'), itemId: requiredString(value.item_id, 'item_id'), listingId: requiredString(value.listing_id, 'listing_id'), nomeItem: requiredString(value.nome_item, 'nome_item'), tipo: value.tipo, quantidade: numberValue(value.quantidade, 'quantidade'), formaPagamento: paymentMethod(value.forma_pagamento), totalReal: numberValue(value.total_real, 'total_real'), totalGemn: nullableNumber(value.total_gemn, 'total_gemn'), gemnUtilizado: numberValue(value.gemn_utilizado, 'gemn_utilizado'), valorDevidoReal: numberValue(value.valor_devido_real, 'valor_devido_real'), criadoEm: requiredString(value.criado_em, 'criado_em'), expiraEm: requiredString(value.expira_em, 'expira_em'), confirmavel: value.confirmavel === true,
  };
}

function normalizeConfirmation(data: unknown): AdminOrderConfirmation {
  const value = singleRow(data);
  return { orderId: requiredString(value.order_id, 'order_id'), status: orderStatus(value.status), confirmacaoIdempotencyKey: requiredString(value.confirmacao_idempotency_key, 'confirmacao_idempotency_key'), confirmadoPor: requiredString(value.confirmado_por, 'confirmado_por'), gemnConsumido: numberValue(value.gemn_consumido, 'gemn_consumido'), cashbackCreditado: numberValue(value.cashback_creditado, 'cashback_creditado'), cashbackRecuperado: numberValue(value.cashback_recuperado, 'cashback_recuperado') };
}

async function requireAuthenticated() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new AdminOrderServiceError('auth', 'É necessário estar autenticado para acessar a administração.');
}

export async function listAdminPendingOrders(limit = 50, offset = 0): Promise<AdminPendingOrder[]> {
  validatePagination(limit, offset);
  await requireAuthenticated();
  const { data, error } = await supabase.rpc('list_admin_pending_orders', { p_limit: limit, p_offset: offset });
  if (error) throw normalizeError(error);
  return rows(data).map(normalizePendingOrder);
}

export async function confirmAdminOrder(orderId: string, idempotencyKey: string): Promise<AdminOrderConfirmation> {
  await requireAuthenticated();
  const { data, error } = await supabase.rpc('confirm_order_payment', { p_order_id: orderId, p_idempotency_key: idempotencyKey });
  if (error) throw normalizeError(error);
  return normalizeConfirmation(data);
}

export const __adminOrderTestables = { normalizePendingOrder, normalizeConfirmation, normalizeError, paymentMethod, orderStatus, validatePagination };
export type AdminOrderErrorKind = AdminOrderServiceErrorKind;
