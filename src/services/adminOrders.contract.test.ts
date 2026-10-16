import { __adminOrderTestables } from './adminOrders';
import { AdminOrderServiceError } from '../types/adminOrders';
import type { AdminOrderConfirmation, AdminPendingOrder } from '../types/adminOrders';

const order: AdminPendingOrder = __adminOrderTestables.normalizePendingOrder({
  order_id: 'order-id', buyer_id: 'buyer-id', item_id: 'item-id', listing_id: 'listing-id', nome_item: 'Produto administrativo', tipo: 'produto', quantidade: 2, forma_pagamento: 'misto', total_real: '100.00', total_gemn: '100.00', gemn_utilizado: '30.00', valor_devido_real: '70.00', criado_em: '2026-10-13T10:00:00Z', expira_em: '2026-10-14T10:00:00Z', confirmavel: true,
});
if (order.formaPagamento !== 'misto' || order.gemnUtilizado !== 30 || order.valorDevidoReal !== 70 || !order.confirmavel) throw new Error('administrative pending order normalization failed');

const expired = __adminOrderTestables.normalizePendingOrder({
  order_id: 'expired-order', buyer_id: 'buyer-id', item_id: 'item-id', listing_id: 'listing-id', nome_item: 'Pedido vencido', tipo: 'servico', quantidade: 1, forma_pagamento: 'real', total_real: 25, total_gemn: null, gemn_utilizado: 0, valor_devido_real: 25, criado_em: '2026-10-12T10:00:00Z', expira_em: '2026-10-13T10:00:00Z', confirmavel: false,
});
if (expired.confirmavel) throw new Error('expired administrative order was marked confirmable');

const confirmation: AdminOrderConfirmation = __adminOrderTestables.normalizeConfirmation([{
  order_id: 'order-id', status: 'confirmado', confirmacao_idempotency_key: 'confirmation-key', confirmado_por: 'admin-id', gemn_consumido: '30.00', cashback_creditado: '3.50', cashback_recuperado: '0.00',
}]);
if (confirmation.confirmacaoIdempotencyKey !== 'confirmation-key' || confirmation.gemnConsumido !== 30) throw new Error('confirmation response normalization failed');

__adminOrderTestables.validatePagination(50, 0);
try { __adminOrderTestables.validatePagination(101, 0); throw new Error('pagination limit unexpectedly accepted'); } catch (error) { if (!(error instanceof AdminOrderServiceError)) throw error; }
try { __adminOrderTestables.validatePagination(50, -1); throw new Error('pagination offset unexpectedly accepted'); } catch (error) { if (!(error instanceof AdminOrderServiceError)) throw error; }

const authorizationError = __adminOrderTestables.normalizeError({ code: 'P0001', message: 'administrador GEMN não autorizado' });
const expiredError = __adminOrderTestables.normalizeError({ code: 'P0001', message: 'pedido expirado para confirmação administrativa' });
const networkError = __adminOrderTestables.normalizeError(new Error('Failed to fetch'));
if (authorizationError.kind !== 'authorization' || expiredError.kind !== 'expired' || !networkError.retryable) throw new Error('administrative error mapping failed');

// A chave é fornecida pelo chamador e deve permanecer idêntica em retries.
const retryKey = 'same-confirmation-key';
const retryParams = { orderId: order.orderId, idempotencyKey: retryKey };
if (retryParams.idempotencyKey !== retryKey) throw new Error('confirmation idempotency key was not preserved');

const aggregated = __adminOrderTestables.normalizePendingOrder({
  order_id: 'multi-order', buyer_id: 'buyer-id', item_count: 2,
  item_id: 'first-item', listing_id: 'first-listing', nome_item: 'Primeiro item', tipo: 'produto', quantidade: 2,
  forma_pagamento: 'real', total_real: 80, total_gemn: null, gemn_utilizado: 0, valor_devido_real: 80,
  criado_em: '2026-10-13T10:00:00Z', expira_em: '2026-10-14T10:00:00Z', confirmavel: true,
  items: [
    { id: 'first-item', listing_id: 'first-listing', seller_id: 'seller-id', nome_item: 'Primeiro item', tipo: 'produto', quantidade: 2, subtotal_real: 50, subtotal_gemn: null, gemn_utilizado_item: 0, cashback_previsto: 0 },
    { id: 'second-item', listing_id: 'second-listing', seller_id: 'seller-id', nome_item: 'Segundo item', tipo: 'servico', quantidade: 1, subtotal_real: 30, subtotal_gemn: null, gemn_utilizado_item: 0, cashback_previsto: 0 },
  ],
});
if (aggregated.itemCount !== 2 || aggregated.items.length !== 2) throw new Error('aggregated administrative order normalization failed');
