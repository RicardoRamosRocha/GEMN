import { __asaasPaymentTestables } from './asaasPayments';
import { AsaasPaymentError } from '../types/asaasPayments';
import type { CreatePixPaymentResponse } from '../types/asaasPayments';

const timeout = __asaasPaymentTestables.normalizeFunctionError({ code: 'ASAAS_TIMEOUT' });
if (!(timeout instanceof AsaasPaymentError) || timeout.code !== 'ASAAS_TIMEOUT' || timeout.retryable) {
  throw new Error('timeout de pagamento não pode ser tratado como retry automático');
}

const validResponse = {
  paymentIntent: {
    paymentIntentId: 'intent-id', orderId: 'order-id', status: 'created',
    amountDueReal: 25, currency: 'BRL', ambiente: 'sandbox',
    externalReference: 'gemn-order-order-id', dueAt: '2026-10-19T00:00:00Z',
  },
  customer: { id: 'customer-row-id', ambiente: 'sandbox', status: 'active' },
  payment: { status: 'qr_ready', asaasPaymentId: 'pay-id', amountDueReal: 25, externalReference: 'gemn-order-order-id' },
  qrCode: { encodedImage: null, payload: 'pix-payload', expiresAt: null },
};
const validateResponse: (value: unknown) => asserts value is CreatePixPaymentResponse = __asaasPaymentTestables.validateResponse;
validateResponse(validResponse);

void timeout;
