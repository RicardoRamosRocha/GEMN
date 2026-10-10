import { supabase } from '../lib/supabase';
import type {
  CreateOrderParams,
  Order,
  OrderItem,
  OrderRpcResult,
  OrderStatus,
  PaymentMethod,
} from '../types/orders';

export type OrderServiceErrorKind = 'auth' | 'business' | 'network' | 'unexpected';

export class OrderServiceError extends Error {
  readonly kind: OrderServiceErrorKind;
  readonly code?: string;

  constructor(kind: OrderServiceErrorKind, message: string, code?: string) {
    super(message);
    this.name = 'OrderServiceError';
    this.kind = kind;
    this.code = code;
  }
}

type UnknownRecord = Record<string, unknown>;

const ORDER_SELECT = 'id,status,forma_pagamento,total_real,total_gemn,criado_em,atualizado_em,order_items(id,order_id,listing_id,seller_id,nome_item,tipo,quantidade,preco_real_unitario,preco_gemn_unitario,subtotal_real,subtotal_gemn,criado_em,atualizado_em)';

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new OrderServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string, nullable = false): number | null {
  if (value === null && nullable) return null;
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new OrderServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  }
  return numberValue;
}

function integerValue(value: unknown, field: string): number {
  const numberValue = finiteNumber(value, field);
  if (numberValue === null || !Number.isInteger(numberValue)) {
    throw new OrderServiceError('unexpected', `Retorno inválido: ${field} não é inteiro.`);
  }
  return numberValue;
}

function orderStatus(value: unknown): OrderStatus {
  if (value === 'pendente' || value === 'confirmado' || value === 'concluido' || value === 'cancelado') return value;
  throw new OrderServiceError('unexpected', 'Retorno inválido: status de pedido desconhecido.');
}

function paymentMethod(value: unknown): PaymentMethod {
  if (value === 'real' || value === 'gemn') return value;
  throw new OrderServiceError('unexpected', 'Retorno inválido: forma de pagamento desconhecida.');
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (isRecord(error) && typeof error.message === 'string') return error.message.toLowerCase();
  return String(error).toLowerCase();
}

function normalizeSupabaseError(error: unknown): OrderServiceError {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const message = errorMessage(error);

  if (code === 'P0001') {
    return new OrderServiceError('business', typeof record.message === 'string' ? record.message : 'Não foi possível registrar o pedido.', code);
  }

  if (code === '42501' || message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) {
    return new OrderServiceError('auth', 'É necessário estar autenticado para acessar os pedidos.', code);
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new OrderServiceError('network', 'Não foi possível conectar ao GEMN. Verifique sua internet e tente novamente.', code);
  }

  return new OrderServiceError('unexpected', 'Não foi possível concluir a operação de pedidos.', code);
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeSupabaseError(error);
  if (!data.user) throw new OrderServiceError('auth', 'É necessário estar autenticado para acessar os pedidos.');
  return data.user;
}

function normalizeRpcResult(data: unknown): OrderRpcResult {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new OrderServiceError('unexpected', 'A criação do pedido retornou um formato inesperado.');
  }

  const row = data[0];
  return {
    orderId: requiredString(row.order_id, 'order_id'),
    status: orderStatus(row.status),
    formaPagamento: paymentMethod(row.forma_pagamento),
    quantidade: integerValue(row.quantidade, 'quantidade'),
    totalReal: finiteNumber(row.total_real, 'total_real') as number,
    totalGemn: finiteNumber(row.total_gemn, 'total_gemn', true),
  };
}

function normalizeItem(value: unknown): OrderItem {
  if (!isRecord(value)) throw new OrderServiceError('unexpected', 'Item de pedido inválido no retorno.');
  if (value.tipo !== 'produto' && value.tipo !== 'servico') throw new OrderServiceError('unexpected', 'Tipo de item inválido no retorno.');
  return {
    id: requiredString(value.id, 'item.id'),
    orderId: requiredString(value.order_id, 'item.order_id'),
    listingId: requiredString(value.listing_id, 'item.listing_id'),
    sellerId: requiredString(value.seller_id, 'item.seller_id'),
    nomeItem: requiredString(value.nome_item, 'item.nome_item'),
    tipo: value.tipo,
    quantidade: integerValue(value.quantidade, 'item.quantidade'),
    precoRealUnitario: finiteNumber(value.preco_real_unitario, 'item.preco_real_unitario') as number,
    precoGemnUnitario: finiteNumber(value.preco_gemn_unitario, 'item.preco_gemn_unitario', true),
    subtotalReal: finiteNumber(value.subtotal_real, 'item.subtotal_real') as number,
    subtotalGemn: finiteNumber(value.subtotal_gemn, 'item.subtotal_gemn', true),
    criadoEm: requiredString(value.criado_em, 'item.criado_em'),
    atualizadoEm: requiredString(value.atualizado_em, 'item.atualizado_em'),
  };
}

function normalizeOrder(value: unknown): Order {
  if (!isRecord(value)) throw new OrderServiceError('unexpected', 'Pedido inválido no retorno.');
  // order_items.order_id possui UNIQUE no MVP. Por isso, o PostgREST infere
  // uma relacao 1:1 e retorna um objeto, em vez de uma lista. Aceitamos os
  // dois formatos para manter o servico resiliente caso a cardinalidade mude.
  const rawItemsValue = value.order_items;
  const rawItems = Array.isArray(rawItemsValue)
    ? rawItemsValue
    : isRecord(rawItemsValue)
      ? [rawItemsValue]
      : null;
  if (!rawItems || rawItems.length !== 1) throw new OrderServiceError('unexpected', 'Itens do pedido ausentes ou invalidos no retorno.');
  return {
    id: requiredString(value.id, 'id'),
    status: orderStatus(value.status),
    formaPagamento: paymentMethod(value.forma_pagamento),
    totalReal: finiteNumber(value.total_real, 'total_real') as number,
    totalGemn: finiteNumber(value.total_gemn, 'total_gemn', true),
    criadoEm: requiredString(value.criado_em, 'criado_em'),
    atualizadoEm: requiredString(value.atualizado_em, 'atualizado_em'),
    items: rawItems.map(normalizeItem),
  };
}

export async function createOrder(params: CreateOrderParams): Promise<OrderRpcResult> {
  await requireAuthenticatedUser();

  const { data, error } = await supabase.rpc('create_order', {
    p_listing_id: params.listingId,
    p_quantidade: params.quantidade,
    p_forma_pagamento: params.formaPagamento,
    p_idempotency_key: params.idempotencyKey,
  });

  if (error) throw normalizeSupabaseError(error);
  return normalizeRpcResult(data);
}

export async function listMyOrders(): Promise<Order[]> {
  await requireAuthenticatedUser();

  const { data, error } = await supabase
    .from('orders')
    .select(ORDER_SELECT)
    .order('criado_em', { ascending: false });

  if (error) throw normalizeSupabaseError(error);
  if (!Array.isArray(data)) throw new OrderServiceError('unexpected', 'A consulta de pedidos retornou um formato inesperado.');
  return data.map(normalizeOrder);
}
