import { supabase } from '../lib/supabase';
import { CancellationRequestServiceError } from '../types/cancellationRequests';
import type {
  CancellationRequestAttempt,
  CancellationRequestQuery,
  SellerCancellationRequestQuery,
  SellerRelatedOrder,
} from '../types/cancellationRequestQueries';
import type { CancellationRequesterRole, CancellationRequestStatus } from '../types/cancellationRequests';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new CancellationRequestServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field);
}

function numeric(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) throw new CancellationRequestServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  return result;
}

function status(value: unknown): CancellationRequestStatus {
  if (value === 'pendente' || value === 'aprovada' || value === 'rejeitada' || value === 'execucao_falhou') return value;
  throw new CancellationRequestServiceError('unexpected', 'Retorno inválido: status de solicitação desconhecido.');
}

function role(value: unknown): CancellationRequesterRole {
  if (value === 'comprador' || value === 'vendedor') return value;
  throw new CancellationRequestServiceError('unexpected', 'Retorno inválido: papel do solicitante desconhecido.');
}

function rows(data: unknown): UnknownRecord[] {
  if (!Array.isArray(data) || !data.every(isRecord)) throw new CancellationRequestServiceError('unexpected', 'A consulta retornou um formato inesperado.');
  return data;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (isRecord(error) && typeof error.message === 'string') return error.message.toLowerCase();
  return String(error).toLowerCase();
}

function normalizeError(error: unknown): CancellationRequestServiceError {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const message = errorMessage(error);
  const raw = typeof record.message === 'string' ? record.message : undefined;
  if (code === 'P0001' && (message.includes('administrador') || message.includes('autorizado'))) return new CancellationRequestServiceError('authorization', raw ?? 'Você não tem autorização para consultar estes dados.', code);
  if (code === 'P0001') return new CancellationRequestServiceError('validation', raw ?? 'Não foi possível consultar os dados solicitados.', code);
  if (code === '42501' || message.includes('not authenticated') || message.includes('permission denied')) return new CancellationRequestServiceError('auth', 'É necessário estar autenticado para consultar estes dados.', code);
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) return new CancellationRequestServiceError('network', 'Não foi possível atualizar os dados. O resultado da consulta pode estar inconclusivo.', code, true);
  return new CancellationRequestServiceError('unexpected', 'Não foi possível consultar os dados de cancelamento.', code);
}

function mapRequest(row: UnknownRecord): CancellationRequestQuery {
  return {
    requestId: requiredString(row.request_id, 'request_id'),
    orderId: requiredString(row.order_id, 'order_id'),
    requestedBy: requiredString(row.requested_by, 'requested_by'),
    requesterRole: role(row.requester_role),
    requesterSellerId: nullableString(row.requester_seller_id, 'requester_seller_id'),
    motivoSolicitacao: requiredString(row.motivo_solicitacao, 'motivo_solicitacao'),
    status: status(row.status),
    decisionIdempotencyKey: nullableString(row.decision_idempotency_key, 'decision_idempotency_key'),
    decidedBy: nullableString(row.decided_by, 'decided_by'),
    motivoDecisao: nullableString(row.motivo_decisao, 'motivo_decisao'),
    orderCancellationId: nullableString(row.order_cancellation_id, 'order_cancellation_id'),
    erroCodigo: nullableString(row.erro_codigo, 'erro_codigo'),
    erroMensagem: nullableString(row.erro_mensagem, 'erro_mensagem'),
    orderStatus: requiredString(row.order_status, 'order_status'),
    totalReal: numeric(row.total_real, 'total_real'),
    gemnUtilizado: numeric(row.gemn_utilizado, 'gemn_utilizado'),
    valorDevidoReal: numeric(row.valor_devido_real, 'valor_devido_real'),
    orderCriadoEm: nullableString(row.order_criado_em, 'order_criado_em') ?? undefined,
    criadoEm: requiredString(row.criado_em, 'criado_em'),
    atualizadoEm: requiredString(row.atualizado_em, 'atualizado_em'),
    decididoEm: nullableString(row.decidido_em, 'decidido_em'),
  };
}

function mapSellerOrder(row: UnknownRecord): SellerRelatedOrder {
  return {
    orderId: requiredString(row.order_id, 'order_id'),
    orderStatus: requiredString(row.order_status, 'order_status'),
    formaPagamento: requiredString(row.forma_pagamento, 'forma_pagamento'),
    totalReal: numeric(row.total_real, 'total_real'),
    totalGemn: row.total_gemn === null ? null : numeric(row.total_gemn, 'total_gemn'),
    gemnUtilizado: numeric(row.gemn_utilizado, 'gemn_utilizado'),
    valorDevidoReal: numeric(row.valor_devido_real, 'valor_devido_real'),
    orderCriadoEm: requiredString(row.order_criado_em, 'order_criado_em'),
    itemId: requiredString(row.item_id, 'item_id'),
    listingId: requiredString(row.listing_id, 'listing_id'),
    sellerId: requiredString(row.seller_id, 'seller_id'),
    nomeItem: requiredString(row.nome_item, 'nome_item'),
    tipo: requiredString(row.tipo, 'tipo'),
    quantidade: numeric(row.quantidade, 'quantidade'),
    subtotalReal: numeric(row.subtotal_real, 'subtotal_real'),
    subtotalGemn: row.subtotal_gemn === null ? null : numeric(row.subtotal_gemn, 'subtotal_gemn'),
    cashbackPercentual: numeric(row.cashback_percentual, 'cashback_percentual'),
    cashbackPrevisto: numeric(row.cashback_previsto, 'cashback_previsto'),
    itemCriadoEm: requiredString(row.item_criado_em, 'item_criado_em'),
  };
}

function mapSellerCancellationRequest(row: UnknownRecord): SellerCancellationRequestQuery {
  return {
    requestId: requiredString(row.request_id, 'request_id'),
    orderId: requiredString(row.order_id, 'order_id'),
    requesterRole: role(row.requester_role),
    motivoSolicitacao: requiredString(row.motivo_solicitacao, 'motivo_solicitacao'),
    status: status(row.status),
    motivoDecisao: nullableString(row.motivo_decisao, 'motivo_decisao'),
    orderStatus: requiredString(row.order_status, 'order_status'),
    criadoEm: requiredString(row.criado_em, 'criado_em'),
    atualizadoEm: requiredString(row.atualizado_em, 'atualizado_em'),
    decididoEm: nullableString(row.decidido_em, 'decidido_em'),
  };
}

function mapAttempt(row: UnknownRecord): CancellationRequestAttempt {
  return {
    attemptId: requiredString(row.attempt_id, 'attempt_id'),
    requestId: requiredString(row.request_id, 'request_id'),
    operacao: requiredString(row.operacao, 'operacao'),
    resultado: requiredString(row.resultado, 'resultado'),
    orderCancellationId: nullableString(row.order_cancellation_id, 'order_cancellation_id'),
    erroCodigo: nullableString(row.erro_codigo, 'erro_codigo'),
    erroMensagem: nullableString(row.erro_mensagem, 'erro_mensagem'),
    criadoEm: requiredString(row.criado_em, 'criado_em'),
    finalizadoEm: requiredString(row.finalizado_em, 'finalizado_em'),
  };
}

async function requireUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new CancellationRequestServiceError('auth', 'É necessário estar autenticado para consultar estes dados.');
}

export async function listMyCancellationRequests(): Promise<CancellationRequestQuery[]> {
  await requireUser();
  const { data, error } = await supabase.rpc('list_my_cancellation_requests');
  if (error) throw normalizeError(error);
  return rows(data).map(mapRequest);
}

export async function listSellerRelatedOrders(): Promise<SellerRelatedOrder[]> {
  await requireUser();
  const { data, error } = await supabase.rpc('list_seller_related_orders');
  if (error) throw normalizeError(error);
  return rows(data).map(mapSellerOrder);
}

export async function listSellerCancellationRequests(): Promise<SellerCancellationRequestQuery[]> {
  await requireUser();
  const { data, error } = await supabase.rpc('list_seller_cancellation_requests');
  if (error) throw normalizeError(error);
  return rows(data).map(mapSellerCancellationRequest);
}

export async function listAdminCancellationRequests(statusFilter?: CancellationRequestStatus): Promise<CancellationRequestQuery[]> {
  await requireUser();
  const { data, error } = await supabase.rpc('list_admin_cancellation_requests', { p_status: statusFilter ?? null });
  if (error) throw normalizeError(error);
  return rows(data).map(mapRequest);
}

export async function listCancellationRequestAttempts(requestId: string): Promise<CancellationRequestAttempt[]> {
  await requireUser();
  const { data, error } = await supabase.rpc('list_cancellation_request_attempts', { p_request_id: requestId });
  if (error) throw normalizeError(error);
  return rows(data).map(mapAttempt);
}
