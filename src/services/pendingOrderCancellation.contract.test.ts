import { __pendingOrderCancellationTestables } from './pendingOrderCancellation';
import { PendingOrderCancellationServiceError } from '../types/pendingOrderCancellation';
import type { PendingOrderCancellationParams, PendingOrderCancellationResult } from '../types/pendingOrderCancellation';

const result: PendingOrderCancellationResult = __pendingOrderCancellationTestables.normalizeResult([{
  order_id: 'order-id',
  status: 'cancelado',
  gemn_liberado: '4.00',
  cancelado_por: 'buyer-id',
}]);

if (result.status !== 'cancelado' || result.gemnLiberado !== 4 || result.canceladoPor !== 'buyer-id') {
  throw new Error('pending cancellation result normalization failed');
}

const retryKey = '00000000-0000-4000-8000-000000000041';
const firstAttempt: PendingOrderCancellationParams = { orderId: result.orderId, idempotencyKey: retryKey };
const retryAttempt: PendingOrderCancellationParams = { orderId: result.orderId, idempotencyKey: retryKey };
if (firstAttempt.idempotencyKey !== retryAttempt.idempotencyKey) throw new Error('pending cancellation retry changed idempotency key');

const expiredError = __pendingOrderCancellationTestables.normalizeError({ code: 'P0001', message: 'somente pedidos pendentes podem ser cancelados' });
const authorizationError = __pendingOrderCancellationTestables.normalizeError({ code: 'P0001', message: 'usuário não pode cancelar este pedido' });
const networkError = __pendingOrderCancellationTestables.normalizeError(new Error('Failed to fetch'));
if (expiredError.kind !== 'conflict' || authorizationError.kind !== 'authorization' || !networkError.retryable) {
  throw new Error('pending cancellation error normalization failed');
}

try {
  __pendingOrderCancellationTestables.normalizeResult([{ order_id: 'order-id', status: 'pendente', gemn_liberado: 0, cancelado_por: 'buyer-id' }]);
  throw new Error('unexpected pending cancellation status accepted');
} catch (error) {
  if (!(error instanceof PendingOrderCancellationServiceError)) throw error;
}
