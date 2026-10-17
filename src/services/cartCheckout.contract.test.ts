import { __cartCheckoutTestables } from './cartCheckout';

const row = (overrides: Record<string, unknown> = {}) => ({
  order_id: 'order-1', status: 'pendente', forma_pagamento: 'misto', seller_id: 'seller-1',
  total_real: '30.00', total_gemn: '30.00', gemn_utilizado: '10.00', valor_devido_real: '20.00',
  order_item_id: 'item-1', listing_id: 'listing-1', quantidade: 2, preco_real_unitario: '15.00',
  subtotal_real: '30.00', gemn_utilizado_item: '10.00', cashback_percentual: '5.00', cashback_previsto: '1.00',
  ...overrides,
});

const normalized = __cartCheckoutTestables.normalizeRows([row(), row({ order_item_id: 'item-2', listing_id: 'listing-2' })]);
if (normalized.orderId !== 'order-1' || normalized.sellerId !== 'seller-1' || normalized.items.length !== 2) throw new Error('multi-item RPC result contract failed');
if (normalized.gemnUsed !== 10 || normalized.items[1].listingId !== 'listing-2') throw new Error('multi-item financial snapshot contract failed');

let divergentRejected = false;
try {
  __cartCheckoutTestables.normalizeRows([row(), row({ order_id: 'order-2' })]);
} catch {
  divergentRejected = true;
}
if (!divergentRejected) throw new Error('rows from different orders must be rejected');

if (__cartCheckoutTestables.paymentMethod('real') !== 'real') throw new Error('payment method normalization failed');
if (__cartCheckoutTestables.status('pendente') !== 'pendente') throw new Error('status normalization failed');
