import { supabase } from '../lib/supabase';
import type {
  CreatePixPaymentRequest,
  CreatePixPaymentResponse,
} from '../types/asaasPayments';
import { AsaasPaymentError } from '../types/asaasPayments';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorCode(value: unknown): string | undefined {
  return isRecord(value) && typeof value.code === 'string' ? value.code : undefined;
}

function normalizeFunctionError(error: unknown): AsaasPaymentError {
  const code = errorCode(error);
  const message = isRecord(error) && typeof error.message === 'string' ? error.message.toLowerCase() : '';

  if (code === '401' || message.includes('jwt') || message.includes('unauthorized')) {
    return new AsaasPaymentError('UNAUTHORIZED', 'É necessário estar autenticado para pagar com Pix.');
  }
  if (code === '403' || message.includes('forbidden')) {
    return new AsaasPaymentError('FORBIDDEN', 'A operação de pagamento não está autorizada.');
  }
  if (code === 'PAYMENT_NEEDS_RECONCILIATION') {
    return new AsaasPaymentError('PAYMENT_NEEDS_RECONCILIATION', 'Este pagamento precisa ser reconciliado antes de uma nova ação.');
  }
  if (code === 'ASAAS_TIMEOUT' || message.includes('timeout') || message.includes('network') || message.includes('fetch')) {
    return new AsaasPaymentError('ASAAS_TIMEOUT', 'Não foi possível confirmar o resultado do pagamento. Ele será reconciliado antes de qualquer nova cobrança.', false);
  }
  if (code && code in {
    INVALID_REQUEST: true,
    ORDER_NOT_ELIGIBLE: true,
    PAYMENT_INTENT_NOT_FOUND: true,
    PAYMENT_ALREADY_IN_PROGRESS: true,
    PAYMENT_ALREADY_CREATED: true,
    ASAAS_UNAVAILABLE: true,
    ASAAS_REJECTED: true,
    INTERNAL_ERROR: true,
  }) {
    return new AsaasPaymentError(code as AsaasPaymentError['code'], 'Não foi possível preparar o pagamento Pix.');
  }
  return new AsaasPaymentError('INTERNAL_ERROR', 'Não foi possível preparar o pagamento Pix.');
}

function validateResponse(value: unknown): asserts value is CreatePixPaymentResponse {
  if (!isRecord(value) || !isRecord(value.paymentIntent) || !isRecord(value.payment) || !isRecord(value.qrCode)) {
    throw new AsaasPaymentError('INTERNAL_ERROR', 'A resposta do pagamento Pix é inválida.');
  }
}

export async function createPixPayment(request: CreatePixPaymentRequest): Promise<CreatePixPaymentResponse> {
  if (!request.orderId || !request.idempotencyKey) {
    throw new AsaasPaymentError('INVALID_REQUEST', 'Pedido e chave de idempotência são obrigatórios.');
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new AsaasPaymentError('UNAUTHORIZED', 'É necessário estar autenticado para pagar com Pix.');
  }

  const { data, error } = await supabase.functions.invoke('asaas-create-payment', {
    body: request,
  });

  if (error) throw normalizeFunctionError(error);
  validateResponse(data);
  return data;
}

export const __asaasPaymentTestables = {
  normalizeFunctionError,
  validateResponse,
};
