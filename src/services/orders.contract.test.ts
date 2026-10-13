import { __ordersTestables } from './orders';
import type { OrderRpcResult, OrderStatus, PaymentMethod } from '../types/orders';

// Teste de contrato compilável: o projeto não possui runner Jest/Vitest.
const mixed: PaymentMethod = __ordersTestables.paymentMethod('misto');
const expired: OrderStatus = __ordersTestables.orderStatus('expirado');
if (mixed !== 'misto') throw new Error('mixed payment method was not normalized');
if (expired !== 'expirado') throw new Error('expired order status was not normalized');

const rpcResult = __ordersTestables.normalizeRpcResult([{
  order_id: 'order-mixed',
  status: 'pendente',
  forma_pagamento: 'misto',
  quantidade: 2,
  total_real: '100.00',
  total_gemn: '100.00',
  gemn_utilizado: '30.00',
  valor_devido_real: '70.00',
  cashback_percentual: '5.00',
  cashback_previsto: '3.50',
}]);
if (rpcResult.formaPagamento !== 'misto' || rpcResult.gemnUtilizado !== 30 || rpcResult.valorDevidoReal !== 70) {
  throw new Error('mixed order financial fields were normalized incorrectly');
}

const now = new Date().toISOString();
const order = __ordersTestables.normalizeOrder({
  id: 'order-expired',
  status: 'expirado',
  forma_pagamento: 'real',
  total_real: '50.00',
  total_gemn: null,
  gemn_utilizado: '0.00',
  valor_devido_real: '50.00',
  criado_em: now,
  atualizado_em: now,
  order_items: {
    id: 'item-expired',
    order_id: 'order-expired',
    listing_id: 'listing-expired',
    seller_id: 'seller-expired',
    nome_item: 'Produto expirado',
    tipo: 'produto',
    quantidade: 1,
    preco_real_unitario: '50.00',
    preco_gemn_unitario: null,
    subtotal_real: '50.00',
    subtotal_gemn: null,
    cashback_percentual: '0.00',
    cashback_previsto: '0.00',
    criado_em: now,
    atualizado_em: now,
  },
});
if (order.status !== 'expirado' || order.totalGemn !== null || order.valorDevidoReal !== 50) {
  throw new Error('expired order snapshot was normalized incorrectly');
}

const typedResult: OrderRpcResult = rpcResult;
void typedResult;
