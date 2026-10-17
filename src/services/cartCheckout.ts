import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type { CartCheckoutItemInput, CartCheckoutOrderItem, CartCheckoutOrderResult } from '../types/cart';

type UnknownRecord = Record<string, unknown>;

export type CartCheckoutErrorKind = 'auth' | 'business' | 'network' | 'unexpected';

export class CartCheckoutError extends Error {
  readonly kind: CartCheckoutErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(kind: CartCheckoutErrorKind, message: string, code?: string, retryable = false) {
    super(message);
    this.name = 'CartCheckoutError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new CartCheckoutError('unexpected', `Retorno inválido: ${field}.`);
  return value;
}

function numberValue(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) throw new CartCheckoutError('unexpected', `Retorno inválido: ${field}.`);
  return result;
}

function integerValue(value: unknown, field: string): number {
  const result = numberValue(value, field);
  if (!Number.isInteger(result)) throw new CartCheckoutError('unexpected', `Retorno inválido: ${field}.`);
  return result;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  return numberValue(value, field);
}

function paymentMethod(value: unknown): CartCheckoutOrderResult['paymentMethod'] {
  if (value === 'real' || value === 'gemn' || value === 'misto') return value;
  throw new CartCheckoutError('unexpected', 'A RPC retornou uma forma de pagamento inválida.');
}

function status(value: unknown): CartCheckoutOrderResult['status'] {
  if (value === 'pendente' || value === 'confirmado' || value === 'concluido' || value === 'cancelado' || value === 'expirado') return value;
  throw new CartCheckoutError('unexpected', 'A RPC retornou um status inválido.');
}

function normalizeError(error: unknown): CartCheckoutError {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const rawMessage = typeof record.message === 'string' ? record.message : String(error);
  const message = rawMessage.toLowerCase();
  if (code === 'P0001') return new CartCheckoutError('business', rawMessage, code);
  if (code === '42501' || message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) {
    return new CartCheckoutError('auth', 'É necessário estar autenticado para finalizar o carrinho.', code);
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new CartCheckoutError('network', 'Não foi possível concluir este vendedor. Tente novamente.', code, true);
  }
  return new CartCheckoutError('unexpected', 'Não foi possível concluir este vendedor.', code);
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new CartCheckoutError('auth', 'É necessário estar autenticado para finalizar o carrinho.');
  return data.user;
}

function normalizeRow(value: unknown): { sellerId: string; result: CartCheckoutOrderResult; item: CartCheckoutOrderItem } {
  if (!isRecord(value)) throw new CartCheckoutError('unexpected', 'A RPC retornou um item inválido.');
  const sellerId = requiredString(value.seller_id, 'seller_id');
  const item: CartCheckoutOrderItem = {
    orderItemId: requiredString(value.order_item_id, 'order_item_id'),
    listingId: requiredString(value.listing_id, 'listing_id'),
    quantity: integerValue(value.quantidade, 'quantidade'),
    priceRealUnit: numberValue(value.preco_real_unitario, 'preco_real_unitario'),
    subtotalReal: numberValue(value.subtotal_real, 'subtotal_real'),
    gemnUsedItem: numberValue(value.gemn_utilizado_item, 'gemn_utilizado_item'),
    cashbackPercentual: numberValue(value.cashback_percentual, 'cashback_percentual'),
    cashbackEstimated: numberValue(value.cashback_previsto, 'cashback_previsto'),
  };
  const result: CartCheckoutOrderResult = {
    orderId: requiredString(value.order_id, 'order_id'),
    sellerId,
    status: status(value.status),
    paymentMethod: paymentMethod(value.forma_pagamento),
    totalReal: numberValue(value.total_real, 'total_real'),
    totalGemn: nullableNumber(value.total_gemn, 'total_gemn'),
    gemnUsed: numberValue(value.gemn_utilizado, 'gemn_utilizado'),
    dueReal: numberValue(value.valor_devido_real, 'valor_devido_real'),
    cashbackEstimated: numberValue(value.cashback_previsto, 'cashback_previsto'),
    items: [item],
  };
  return { sellerId, result, item };
}

function normalizeRows(data: unknown): CartCheckoutOrderResult {
  if (!Array.isArray(data) || data.length === 0) throw new CartCheckoutError('unexpected', 'A criação do pedido retornou um formato inesperado.');
  const rows = data.map(normalizeRow);
  const first = rows[0].result;
  if (rows.some((row) => row.result.orderId !== first.orderId || row.sellerId !== first.sellerId)) {
    throw new CartCheckoutError('unexpected', 'A RPC retornou itens de pedidos diferentes.');
  }
  return { ...first, cashbackEstimated: Number(rows.reduce((sum, row) => sum + row.item.cashbackEstimated, 0).toFixed(2)), items: rows.map((row) => row.item) };
}

export function createCheckoutIdempotencyKey(): string {
  return Crypto.randomUUID();
}

export async function getAvailableGemnBalance(): Promise<number> {
  const user = await requireAuthenticatedUser();
  const { data, error } = await supabase.from('wallets').select('saldo_disponivel').eq('user_id', user.id).maybeSingle();
  if (error) throw normalizeError(error);
  if (!data) return 0;
  return Math.max(0, numberValue(data.saldo_disponivel, 'saldo_disponivel'));
}

export async function createOrderFromItems(params: {
  items: CartCheckoutItemInput[];
  gemnUsed: number;
  idempotencyKey: string;
}): Promise<CartCheckoutOrderResult> {
  await requireAuthenticatedUser();
  if (!Number.isFinite(params.gemnUsed) || params.gemnUsed < 0 || Math.round(params.gemnUsed * 100) !== params.gemnUsed * 100) {
    throw new CartCheckoutError('business', 'O valor GEMN informado é inválido.');
  }
  const { data, error } = await supabase.rpc('create_order_from_items', {
    p_items: params.items.map((item) => ({ listing_id: item.listingId, quantidade: item.quantity })),
    p_gemn_utilizado: params.gemnUsed,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw normalizeError(error);
  return normalizeRows(data);
}

export const __cartCheckoutTestables = { normalizeRows, normalizeError, paymentMethod, status };
