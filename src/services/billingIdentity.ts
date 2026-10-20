import { supabase } from '../lib/supabase';
import { listMyOrders } from './orders';
import type { Order } from '../types/orders';
import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

const DEV_SUPABASE_HOST = 'lfsbjynpsgcvdtaeotho.supabase.co';
const SAFE_ERROR_CODES = new Set([
  'INVALID_REQUEST',
  'INVALID_DOCUMENT',
  'UNAUTHORIZED',
  'PAYMENT_NOT_REQUIRED',
  'IDENTITY_CONFLICT',
  'PERSISTENCE_FAILED',
  'INTERNAL_ERROR',
  'CONFIGURATION_INVALID',
  'EDGE_FUNCTION_FAILED',
]);

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: 'Revise os dados do teste e tente novamente.',
  INVALID_DOCUMENT: 'O documento de homologação é inválido.',
  UNAUTHORIZED: 'A sessão expirou. Entre novamente para repetir o teste.',
  PAYMENT_NOT_REQUIRED: 'O pedido selecionado não está elegível para o teste.',
  IDENTITY_CONFLICT: 'Já existe outra identidade de cobrança ativa.',
  PERSISTENCE_FAILED: 'Não foi possível salvar a identidade de cobrança.',
  CONFIGURATION_INVALID: 'O cadastro está temporariamente indisponível.',
  INTERNAL_ERROR: 'O cadastro falhou por um erro interno.',
  EDGE_FUNCTION_FAILED: 'Não foi possível concluir o cadastro de homologação.',
  TRANSPORT_NETWORK: 'Não foi possível conectar ao serviço de homologação.',
  TRANSPORT_RELAY: 'O serviço de homologação está temporariamente indisponível.',
};

export type BillingIdentityRegistrationOutcome = 'created' | 'reused';

export class BillingIdentityServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BillingIdentityServiceError';
    this.code = code;
  }
}

function safeErrorCode(value: unknown): string {
  return typeof value === 'string' && SAFE_ERROR_CODES.has(value)
    ? value
    : 'EDGE_FUNCTION_FAILED';
}

function safeErrorMessage(code: string): string {
  return SAFE_ERROR_MESSAGES[code] ?? SAFE_ERROR_MESSAGES.EDGE_FUNCTION_FAILED;
}

function transportErrorCode(error: unknown): string | null {
  if (error instanceof FunctionsFetchError) return 'TRANSPORT_NETWORK';
  if (error instanceof FunctionsRelayError) return 'TRANSPORT_RELAY';
  return null;
}

async function functionErrorCode(error: unknown): Promise<string> {
  if (error instanceof FunctionsFetchError) return 'TRANSPORT_NETWORK';
  if (error instanceof FunctionsRelayError) return 'TRANSPORT_RELAY';
  if (!(error instanceof FunctionsHttpError)) return 'EDGE_FUNCTION_FAILED';
  try {
    const body = await error.context.json() as { error?: unknown };
    return safeErrorCode(body?.error);
  } catch {
    return 'EDGE_FUNCTION_FAILED';
  }
}

function devProjectHost(): string | null {
  try {
    return new URL(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').host;
  } catch {
    return null;
  }
}

export function isBillingIdentityTestAvailable(): boolean {
  return __DEV__ === true && devProjectHost() === DEV_SUPABASE_HOST;
}

export async function listPendingBillingIdentityOrders(): Promise<Order[]> {
  return (await listMyOrders()).filter((order) =>
    order.status === 'pendente' && order.valorDevidoReal > 0
  );
}

export async function registerBillingIdentity(
  orderId: string,
  document: string,
): Promise<{ outcome: BillingIdentityRegistrationOutcome }> {
  if (!isBillingIdentityTestAvailable()) {
    throw new BillingIdentityServiceError(
      'DEV_ONLY',
      'Esta ação está disponível somente no ambiente DEV.',
    );
  }

  const normalizedOrderId = orderId.trim();
  const normalizedDocument = document.trim();
  if (!normalizedOrderId || !normalizedDocument) {
    throw new BillingIdentityServiceError(
      'INVALID_REQUEST',
      'Selecione um pedido e informe um documento de homologação.',
    );
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new BillingIdentityServiceError(
      'UNAUTHORIZED',
      'É necessário estar autenticado para executar o teste.',
    );
  }

  const eligibleOrders = await listPendingBillingIdentityOrders();
  if (!eligibleOrders.some((order) => order.id === normalizedOrderId)) {
    throw new BillingIdentityServiceError(
      'PAYMENT_NOT_REQUIRED',
      'O pedido selecionado não está mais elegível para o teste.',
    );
  }

  const { data, error } = await supabase.functions.invoke(
    'asaas-register-billing-identity',
    { body: { orderId: normalizedOrderId, document: normalizedDocument } },
  );

  if (error) {
    const code = await functionErrorCode(error);
    throw new BillingIdentityServiceError(
      code,
      safeErrorMessage(code),
    );
  }

  if (
    typeof data !== 'object' || data === null ||
    (data as { ok?: unknown }).ok !== true
  ) {
    const code = safeErrorCode((data as { error?: unknown } | null)?.error);
    throw new BillingIdentityServiceError(
      code,
      safeErrorMessage(code),
    );
  }

  const outcome = (data as { outcome?: unknown }).outcome;
  if (outcome !== 'created' && outcome !== 'reused') {
    throw new BillingIdentityServiceError(
      'EDGE_FUNCTION_FAILED',
      'A função retornou uma resposta inválida.',
    );
  }

  return { outcome };
}

export const __billingIdentityTestables = {
  safeErrorCode,
  safeErrorMessage,
  transportErrorCode,
};
