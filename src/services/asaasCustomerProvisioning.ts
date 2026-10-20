import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';

import { supabase } from '../lib/supabase';
import { isBillingIdentityTestAvailable } from './billingIdentity';

const SAFE_ERROR_CODES = new Set([
  'IDENTITY_UNAVAILABLE',
  'PROVISIONING_IN_PROGRESS',
  'PROVISIONING_NEEDS_REVIEW',
  'ASAAS_REJECTED',
  'ASAAS_UNAVAILABLE',
  'ASAAS_TIMEOUT',
  'INTERNAL_ERROR',
]);

const SAFE_ERROR_MESSAGES: Record<string, string> = {
  IDENTITY_UNAVAILABLE: 'Conclua primeiro o cadastro da identidade de cobrança.',
  PROVISIONING_IN_PROGRESS: 'Existe um provisionamento em andamento. Aguarde a conclusão antes de tentar novamente.',
  PROVISIONING_NEEDS_REVIEW: 'O provisionamento precisa de revisão antes de uma nova tentativa.',
  ASAAS_REJECTED: 'O Asaas rejeitou o cadastro do cliente de teste.',
  ASAAS_UNAVAILABLE: 'O Asaas Sandbox está temporariamente indisponível. Não tente novamente agora.',
  ASAAS_TIMEOUT: 'Não foi possível confirmar o resultado no Asaas Sandbox. Não tente novamente agora.',
  INTERNAL_ERROR: 'Não foi possível concluir o provisionamento do cliente de teste.',
  TRANSPORT_NETWORK: 'Não foi possível conectar ao serviço de homologação.',
  TRANSPORT_RELAY: 'O serviço de homologação está temporariamente indisponível.',
};

export type AsaasCustomerProvisioningOutcome = 'created' | 'reused';

export class AsaasCustomerProvisioningServiceError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'AsaasCustomerProvisioningServiceError';
    this.code = code;
  }
}

function safeErrorCode(value: unknown): string {
  return typeof value === 'string' && SAFE_ERROR_CODES.has(value)
    ? value
    : 'INTERNAL_ERROR';
}

function safeErrorMessage(code: string): string {
  return SAFE_ERROR_MESSAGES[code] ?? SAFE_ERROR_MESSAGES.INTERNAL_ERROR;
}

function transportErrorCode(error: unknown): string | null {
  if (error instanceof FunctionsFetchError) return 'TRANSPORT_NETWORK';
  if (error instanceof FunctionsRelayError) return 'TRANSPORT_RELAY';
  return null;
}

async function functionErrorCode(error: unknown): Promise<string> {
  const transportCode = transportErrorCode(error);
  if (transportCode) return transportCode;
  if (!(error instanceof FunctionsHttpError)) return 'INTERNAL_ERROR';
  try {
    const body = await error.context.json() as { error?: unknown };
    return safeErrorCode(body?.error);
  } catch {
    return 'INTERNAL_ERROR';
  }
}

export async function provisionAsaasSandboxCustomer(): Promise<{
  outcome: AsaasCustomerProvisioningOutcome;
}> {
  if (!isBillingIdentityTestAvailable()) {
    throw new AsaasCustomerProvisioningServiceError(
      'DEV_ONLY',
      'Esta ação está disponível somente no ambiente DEV.',
    );
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session) {
    throw new AsaasCustomerProvisioningServiceError(
      'UNAUTHORIZED',
      'É necessário estar autenticado para executar o teste.',
    );
  }

  const { data, error } = await supabase.functions.invoke('asaas-provision-customer');
  if (error) {
    const code = await functionErrorCode(error);
    throw new AsaasCustomerProvisioningServiceError(code, safeErrorMessage(code));
  }

  if (typeof data !== 'object' || data === null || (data as { ok?: unknown }).ok !== true) {
    const code = safeErrorCode((data as { error?: unknown } | null)?.error);
    throw new AsaasCustomerProvisioningServiceError(code, safeErrorMessage(code));
  }

  const outcome = (data as { outcome?: unknown }).outcome;
  if (outcome !== 'created' && outcome !== 'reused') {
    throw new AsaasCustomerProvisioningServiceError('INTERNAL_ERROR', safeErrorMessage('INTERNAL_ERROR'));
  }
  return { outcome };
}

export const __asaasCustomerProvisioningTestables = {
  safeErrorCode,
  safeErrorMessage,
  transportErrorCode,
};
