import type { OrderStatus } from './orders';

export type PendingOrderCancellationParams = {
  orderId: string;
  idempotencyKey: string;
};

export type PendingOrderCancellationResult = {
  orderId: string;
  status: Extract<OrderStatus, 'cancelado'>;
  gemnLiberado: number;
  canceladoPor: string;
};

export type PendingOrderCancellationErrorKind =
  | 'auth'
  | 'authorization'
  | 'conflict'
  | 'network'
  | 'unexpected';

export class PendingOrderCancellationServiceError extends Error {
  readonly kind: PendingOrderCancellationErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    kind: PendingOrderCancellationErrorKind,
    message: string,
    code?: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'PendingOrderCancellationServiceError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}
