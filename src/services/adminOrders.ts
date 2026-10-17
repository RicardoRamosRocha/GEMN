import { supabase } from '../lib/supabase';
import type { AdminOrderConfirmation, AdminOrderServiceErrorKind, AdminPendingOrder, AdminPendingOrderItem } from '../types/adminOrders';
import { AdminOrderServiceError } from '../types/adminOrders';
import type { OrderStatus, PaymentMethod } from '../types/orders';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function requiredString(value: unknown, field: string): string { if (typeof value !== 'string' || value.trim() === '') throw new AdminOrderServiceError('unexpected', `Retorno invalido: ${field} ausente.`); return value; }
function nullableNumber(value: unknown, field: string): number | null { if (value === null || value === undefined) return null; return numberValue(value, field); }
function numberValue(value: unknown, field: string): number { const result = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(result)) throw new AdminOrderServiceError('unexpected', `Retorno invalido: ${field} nao e numerico.`); return result; }
function paymentMethod(value: unknown): PaymentMethod { if (value === 'real' || value === 'gemn' || value === 'misto') return value; throw new AdminOrderServiceError('unexpected', 'Retorno invalido: modalidade de pagamento desconhecida.'); }
function orderStatus(value: unknown): OrderStatus { if (value === 'pendente' || value === 'confirmado' || value === 'concluido' || value === 'cancelado' || value === 'expirado') return value; throw new AdminOrderServiceError('unexpected', 'Retorno invalido: status de pedido desconhecido.'); }
function rows(data: unknown): UnknownRecord[] { if (!Array.isArray(data) || !data.every(isRecord)) throw new AdminOrderServiceError('unexpected', 'A consulta administrativa retornou um formato inesperado.'); return data; }
function singleRow(data: unknown): UnknownRecord { const result = rows(data); if (result.length !== 1) throw new AdminOrderServiceError('unexpected', 'A confirmacao retornou um formato inesperado.'); return result[0]; }
function errorDetails(error: unknown) { const record = isRecord(error) ? error : {}; return { code: typeof record.code === 'string' ? record.code : undefined, message: typeof record.message === 'string' ? record.message : String(error) }; }
function validatePagination(limit: number, offset: number) { if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new AdminOrderServiceError('validation', 'O limite deve estar entre 1 e 100.'); if (!Number.isInteger(offset) || offset < 0) throw new AdminOrderServiceError('validation', 'O deslocamento nao pode ser negativo.'); }

function normalizeError(error: unknown) {
  const { code, message: raw } = errorDetails(error);
  const message = raw.toLowerCase();
  if (code === 'PGRST301' || code === '42501' || message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) return new AdminOrderServiceError('auth', 'E necessario estar autenticado para acessar a administracao.', code);
  if (code === 'P0001' && (message.includes('administrador') || message.includes('autorizado'))) return new AdminOrderServiceError('authorization', 'Apenas administradores podem consultar ou confirmar pedidos.', code);
  if (code === 'P0001' && (message.includes('expirado') || message.includes('24 horas'))) return new AdminOrderServiceError('expired', 'Este pedido ultrapassou o prazo de 24 horas e nao pode ser confirmado.', code);
  if (code === 'P0001' && (message.includes('ja foi confirmado') || message.includes('somente pedidos pendentes') || message.includes('reserva') || message.includes('consistente'))) return new AdminOrderServiceError('conflict', raw, code);
  if (code === 'P0001') return new AdminOrderServiceError('validation', raw, code);
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) return new AdminOrderServiceError('network', 'Nao foi possivel confirmar o resultado da operacao. Consulte a fila antes de tentar novamente.', code, true);
  return new AdminOrderServiceError('unexpected', 'Nao foi possivel concluir a operacao administrativa.', code);
}

function normalizePendingItem(value: unknown): AdminPendingOrderItem {
  if (!isRecord(value)) throw new AdminOrderServiceError('unexpected', 'Retorno invalido: item administrativo ausente.');
  if (value.tipo !== 'produto' && value.tipo !== 'servico') throw new AdminOrderServiceError('unexpected', 'Retorno invalido: tipo de item desconhecido.');
  return { id: requiredString(value.id, 'items.id'), listingId: requiredString(value.listing_id, 'items.listing_id'), sellerId: requiredString(value.seller_id, 'items.seller_id'), nomeItem: requiredString(value.nome_item, 'items.nome_item'), tipo: value.tipo, quantidade: numberValue(value.quantidade, 'items.quantidade'), subtotalReal: numberValue(value.subtotal_real, 'items.subtotal_real'), subtotalGemn: nullableNumber(value.subtotal_gemn, 'items.subtotal_gemn'), gemnUtilizadoItem: numberValue(value.gemn_utilizado_item, 'items.gemn_utilizado_item'), cashbackPrevisto: numberValue(value.cashback_previsto, 'items.cashback_previsto') };
}

function normalizePendingOrder(value: UnknownRecord): AdminPendingOrder {
  if (value.tipo !== 'produto' && value.tipo !== 'servico') throw new AdminOrderServiceError('unexpected', 'Retorno invalido: tipo de item desconhecido.');
  const legacyItem: AdminPendingOrderItem = { id: requiredString(value.item_id, 'item_id'), listingId: requiredString(value.listing_id, 'listing_id'), sellerId: requiredString(value.seller_id ?? 'legacy-seller', 'seller_id'), nomeItem: requiredString(value.nome_item, 'nome_item'), tipo: value.tipo, quantidade: numberValue(value.quantidade, 'quantidade'), subtotalReal: numberValue(value.subtotal_real ?? value.total_real, 'subtotal_real'), subtotalGemn: nullableNumber(value.subtotal_gemn, 'subtotal_gemn'), gemnUtilizadoItem: numberValue(value.gemn_utilizado_item ?? 0, 'gemn_utilizado_item'), cashbackPrevisto: numberValue(value.cashback_previsto ?? 0, 'cashback_previsto') };
  const items = Array.isArray(value.items) ? value.items.map(normalizePendingItem) : [legacyItem];
  return { orderId: requiredString(value.order_id, 'order_id'), buyerId: requiredString(value.buyer_id, 'buyer_id'), itemId: requiredString(value.item_id, 'item_id'), listingId: requiredString(value.listing_id, 'listing_id'), nomeItem: requiredString(value.nome_item, 'nome_item'), tipo: value.tipo, quantidade: numberValue(value.quantidade, 'quantidade'), formaPagamento: paymentMethod(value.forma_pagamento), totalReal: numberValue(value.total_real, 'total_real'), totalGemn: nullableNumber(value.total_gemn, 'total_gemn'), gemnUtilizado: numberValue(value.gemn_utilizado, 'gemn_utilizado'), valorDevidoReal: numberValue(value.valor_devido_real, 'valor_devido_real'), criadoEm: requiredString(value.criado_em, 'criado_em'), expiraEm: requiredString(value.expira_em, 'expira_em'), confirmavel: value.confirmavel === true, itemCount: numberValue(value.item_count ?? items.length, 'item_count'), items };
}

function normalizeConfirmation(data: unknown): AdminOrderConfirmation { const value = singleRow(data); return { orderId: requiredString(value.order_id, 'order_id'), status: orderStatus(value.status), confirmacaoIdempotencyKey: requiredString(value.confirmacao_idempotency_key, 'confirmacao_idempotency_key'), confirmadoPor: requiredString(value.confirmado_por, 'confirmado_por'), gemnConsumido: numberValue(value.gemn_consumido, 'gemn_consumido'), cashbackCreditado: numberValue(value.cashback_creditado, 'cashback_creditado'), cashbackRecuperado: numberValue(value.cashback_recuperado, 'cashback_recuperado') }; }

async function requireAuthenticated() { const { data, error } = await supabase.auth.getUser(); if (error) throw normalizeError(error); if (!data.user) throw new AdminOrderServiceError('auth', 'E necessario estar autenticado para acessar a administracao.'); }

export async function listAdminPendingOrders(limit = 50, offset = 0): Promise<AdminPendingOrder[]> {
  validatePagination(limit, offset);
  await requireAuthenticated();
  let { data, error } = await supabase.rpc('list_admin_pending_orders_v2', { p_limit: limit, p_offset: offset });
  const details = error ? errorDetails(error) : null;
  const missingV2 = details && (details.code === 'PGRST202' || details.code === '42883' || details.message.toLowerCase().includes('list_admin_pending_orders_v2'));
  if (error && missingV2) {
    ({ data, error } = await supabase.rpc('list_admin_pending_orders', { p_limit: limit, p_offset: offset }));
  }
  if (error) throw normalizeError(error);
  return rows(data).map(normalizePendingOrder);
}
export async function countAdminPendingOrders(): Promise<number> {
  const pageSize = 100;
  let offset = 0;
  let total = 0;
  while (true) {
    const page = await listAdminPendingOrders(pageSize, offset);
    total += page.length;
    if (page.length < pageSize) return total;
    offset += page.length;
  }
}
export async function confirmAdminOrder(orderId: string, idempotencyKey: string): Promise<AdminOrderConfirmation> { await requireAuthenticated(); const { data, error } = await supabase.rpc('confirm_order_payment', { p_order_id: orderId, p_idempotency_key: idempotencyKey }); if (error) throw normalizeError(error); return normalizeConfirmation(data); }

export const __adminOrderTestables = { normalizePendingOrder, normalizePendingItem, normalizeConfirmation, normalizeError, paymentMethod, orderStatus, validatePagination };
export type AdminOrderErrorKind = AdminOrderServiceErrorKind;
