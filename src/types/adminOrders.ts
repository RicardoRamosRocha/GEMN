import type { OrderStatus, PaymentMethod } from './orders';

export type AdminPendingOrder = {
  orderId: string;
  buyerId: string;
  itemId: string;
  listingId: string;
  nomeItem: string;
  tipo: 'produto' | 'servico';
  quantidade: number;
  formaPagamento: PaymentMethod;
  totalReal: number;
  totalGemn: number | null;
  gemnUtilizado: number;
  valorDevidoReal: number;
  criadoEm: string;
  expiraEm: string;
  confirmavel: boolean;
};

export type AdminOrderConfirmation = {
  orderId: string;
  status: OrderStatus;
  confirmacaoIdempotencyKey: string;
  confirmadoPor: string;
  gemnConsumido: number;
  cashbackCreditado: number;
  cashbackRecuperado: number;
};

export type AdminOrderServiceErrorKind = 'auth' | 'authorization' | 'validation' | 'conflict' | 'expired' | 'network' | 'unexpected';

export class AdminOrderServiceError extends Error {
  readonly kind: AdminOrderServiceErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(kind: AdminOrderServiceErrorKind, message: string, code?: string, retryable = false) {
    super(message);
    this.name = 'AdminOrderServiceError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}
