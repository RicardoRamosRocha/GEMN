/**
 * Minimal, server-only Asaas Sandbox client.
 *
 * This module deliberately knows nothing about Supabase, orders or the
 * frontend. Callers must obtain amountDueReal from the trusted orders row.
 */

export type AsaasFetch = typeof fetch;

export type AsaasClientErrorCode =
  | 'CONFIGURATION'
  | 'HTTP_ERROR'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'UNAVAILABLE'
  | 'REFERENCE_MISMATCH'
  | 'AMOUNT_MISMATCH'
  | 'ZERO_AMOUNT';

export class AsaasClientError extends Error {
  readonly code: AsaasClientErrorCode;
  readonly status: number | null;
  readonly uncertain: boolean;

  constructor(
    code: AsaasClientErrorCode,
    message: string,
    options: { status?: number; uncertain?: boolean } = {},
  ) {
    super(message);
    this.name = 'AsaasClientError';
    this.code = code;
    this.status = options.status ?? null;
    this.uncertain = options.uncertain ?? false;
  }
}

export interface AsaasClientConfig {
  baseUrl: string;
  accessToken: string;
  fetchImpl?: AsaasFetch;
  timeoutMs?: number;
}

export interface AsaasCustomer {
  id: string;
  name: string;
  cpfCnpj?: string;
  email?: string;
}

export interface CustomerLookup {
  cpfCnpj: string;
}

export interface CreateCustomerInput {
  name: string;
  cpfCnpj: string;
  email?: string;
  externalReference?: string;
}

export interface AsaasPayment {
  id: string;
  customer: string;
  value: number;
  netValue?: number;
  status: string;
  billingType: string;
  externalReference: string | null;
  dueDate?: string;
}

export interface CreatePixPaymentInput {
  customerId: string;
  /** Trusted value copied from orders.valor_devido_real by the backend. */
  amountDueReal: number;
  dueDate: string;
  externalReference: string;
  description?: string;
}

export interface PixQrCode {
  encodedImage: string | null;
  payload: string | null;
  expirationDate: string | null;
}

const SANDBOX_HOST = 'api-sandbox.asaas.com';
const DEFAULT_TIMEOUT_MS = 8_000;

function cents(value: number): number {
  return Math.round(value * 100);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AsaasClientError('INVALID_RESPONSE', `Asaas response missing ${field}`);
  }
  return value.trim();
}

function finiteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new AsaasClientError('INVALID_RESPONSE', `Asaas response has invalid ${field}`);
  }
  return value;
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new AsaasClientError('INVALID_RESPONSE', 'Asaas response is not an object');
  }
  return value as Record<string, unknown>;
}

function validateBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AsaasClientError('CONFIGURATION', 'ASAAS_BASE_URL is invalid');
  }
  if (url.protocol !== 'https:' || url.hostname !== SANDBOX_HOST || url.search || url.hash) {
    throw new AsaasClientError('CONFIGURATION', 'ASAAS_BASE_URL must be the Asaas Sandbox /v3 URL');
  }
  const path = url.pathname.replace(/\/+$/, '');
  if (path !== '/v3') {
    throw new AsaasClientError('CONFIGURATION', 'ASAAS_BASE_URL must end in /v3');
  }
  return `${url.toString().replace(/\/+$/, '')}/`;
}

function jsonHeaders(token: string): HeadersInit {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    'user-agent': 'GEMN/asaas-sandbox-client',
    access_token: token,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new AsaasClientError('INVALID_RESPONSE', 'Asaas returned invalid JSON', { status: response.status });
  }
}

function parseCustomer(value: unknown): AsaasCustomer {
  const body = record(value);
  return {
    id: requiredString(body.id, 'customer id'),
    name: requiredString(body.name, 'customer name'),
    ...(typeof body.cpfCnpj === 'string' ? { cpfCnpj: body.cpfCnpj } : {}),
    ...(typeof body.email === 'string' ? { email: body.email } : {}),
  };
}

function parsePayment(value: unknown): AsaasPayment {
  const body = record(value);
  const payment: AsaasPayment = {
    id: requiredString(body.id, 'payment id'),
    customer: requiredString(body.customer, 'payment customer'),
    value: finiteNumber(body.value, 'payment value'),
    status: requiredString(body.status, 'payment status'),
    billingType: requiredString(body.billingType, 'payment billingType'),
    externalReference: body.externalReference === null
      ? null
      : requiredString(body.externalReference, 'payment externalReference'),
  };
  if (typeof body.netValue === 'number') payment.netValue = body.netValue;
  if (typeof body.dueDate === 'string') payment.dueDate = body.dueDate;
  return payment;
}

export function createAsaasClientFromEnv(
  env: Pick<Deno.Env, 'get'> = Deno.env,
  fetchImpl: AsaasFetch = fetch,
): AsaasClient {
  const baseUrl = env.get('ASAAS_BASE_URL');
  const accessToken = env.get('ASAAS_ACCESS_TOKEN');
  if (!baseUrl) throw new AsaasClientError('CONFIGURATION', 'ASAAS_BASE_URL is missing');
  if (!accessToken) throw new AsaasClientError('CONFIGURATION', 'ASAAS_ACCESS_TOKEN is missing');
  return createAsaasClient({ baseUrl, accessToken, fetchImpl });
}

export function createAsaasClient(config: AsaasClientConfig): AsaasClient {
  const baseUrl = validateBaseUrl(config.baseUrl);
  if (!config.accessToken.trim()) throw new AsaasClientError('CONFIGURATION', 'ASAAS_ACCESS_TOKEN is missing');
  const fetchImpl = config.fetchImpl ?? fetch;
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new AsaasClientError('CONFIGURATION', 'Asaas timeout is invalid');
  }

  async function request(path: string, init: RequestInit, operation: 'GET' | 'POST'): Promise<unknown> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(new URL(path.replace(/^\//, ''), baseUrl), {
        ...init,
        headers: { ...jsonHeaders(config.accessToken), ...init.headers },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new AsaasClientError('HTTP_ERROR', 'Asaas request failed', { status: response.status });
      }
      return await readJson(response);
    } catch (error) {
      if (error instanceof AsaasClientError) throw error;
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new AsaasClientError('TIMEOUT', 'Asaas request timed out', {
          uncertain: operation === 'POST',
        });
      }
      throw new AsaasClientError('UNAVAILABLE', 'Asaas is unavailable', {
        uncertain: operation === 'POST',
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    async findCustomer(input: CustomerLookup): Promise<AsaasCustomer | null> {
      const cpfCnpj = input.cpfCnpj.trim();
      if (!cpfCnpj) throw new AsaasClientError('CONFIGURATION', 'Customer lookup requires a document');
      const body = record(await request(`customers?cpfCnpj=${encodeURIComponent(cpfCnpj)}`, { method: 'GET' }, 'GET'));
      if (!Array.isArray(body.data)) throw new AsaasClientError('INVALID_RESPONSE', 'Asaas customer lookup is invalid');
      return body.data.length === 0 ? null : parseCustomer(body.data[0]);
    },

    async createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
      const body = await request('customers', {
        method: 'POST',
        body: JSON.stringify({
          name: input.name,
          cpfCnpj: input.cpfCnpj,
          ...(input.email ? { email: input.email } : {}),
          ...(input.externalReference ? { externalReference: input.externalReference } : {}),
        }),
      }, 'POST');
      return parseCustomer(body);
    },

    async createPixPayment(input: CreatePixPaymentInput): Promise<AsaasPayment> {
      if (!Number.isFinite(input.amountDueReal) || input.amountDueReal <= 0) {
        throw new AsaasClientError('ZERO_AMOUNT', 'Pix payment amount must be greater than zero');
      }
      const body = await request('payments', {
        method: 'POST',
        body: JSON.stringify({
          customer: input.customerId,
          billingType: 'PIX',
          value: input.amountDueReal,
          dueDate: input.dueDate,
          externalReference: input.externalReference,
          ...(input.description ? { description: input.description } : {}),
        }),
      }, 'POST');
      const payment = parsePayment(body);
      if (payment.customer !== input.customerId) {
        throw new AsaasClientError('INVALID_RESPONSE', 'Asaas returned a different customer');
      }
      if (payment.billingType !== 'PIX') {
        throw new AsaasClientError('INVALID_RESPONSE', 'Asaas returned a non-Pix payment');
      }
      if (payment.externalReference !== input.externalReference) {
        throw new AsaasClientError('REFERENCE_MISMATCH', 'Asaas payment reference does not match');
      }
      if (cents(payment.value) !== cents(input.amountDueReal)) {
        throw new AsaasClientError('AMOUNT_MISMATCH', 'Asaas payment amount does not match');
      }
      return payment;
    },

    async getPayment(paymentId: string): Promise<AsaasPayment> {
      return parsePayment(await request(`payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }, 'GET'));
    },

    async getPixQrCode(paymentId: string): Promise<PixQrCode> {
      const body = record(await request(`payments/${encodeURIComponent(paymentId)}/pixQrCode`, { method: 'GET' }, 'GET'));
      const hasExpectedFields = 'encodedImage' in body && 'payload' in body && 'expirationDate' in body;
      const fieldsHaveValidTypes = (body.encodedImage === null || typeof body.encodedImage === 'string')
        && (body.payload === null || typeof body.payload === 'string')
        && (body.expirationDate === null || typeof body.expirationDate === 'string');
      if (!hasExpectedFields || !fieldsHaveValidTypes) {
        throw new AsaasClientError('INVALID_RESPONSE', 'Asaas QR code response is invalid');
      }
      return {
        encodedImage: typeof body.encodedImage === 'string' ? body.encodedImage : null,
        payload: typeof body.payload === 'string' ? body.payload : null,
        expirationDate: typeof body.expirationDate === 'string' ? body.expirationDate : null,
      };
    },
  };
}

export interface AsaasClient {
  findCustomer(input: CustomerLookup): Promise<AsaasCustomer | null>;
  createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer>;
  createPixPayment(input: CreatePixPaymentInput): Promise<AsaasPayment>;
  getPayment(paymentId: string): Promise<AsaasPayment>;
  getPixQrCode(paymentId: string): Promise<PixQrCode>;
}
