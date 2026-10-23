import type {
  AuthenticatedBuyer,
  BuyerProfile,
  PaymentClaim,
  PaymentDatabase,
  PaymentIntentStatus,
  PixAuthenticator,
  PreparedPaymentIntent,
  StoredCustomer,
} from '../asaas-orchestrator/index.ts';

export interface SupabaseResult {
  data: unknown;
  error: unknown;
}

export interface SupabaseQueryPort {
  eq(column: string, value: string): SupabaseQueryPort;
  maybeSingle(): PromiseLike<SupabaseResult>;
  single(): PromiseLike<SupabaseResult>;
  order(column: string, options: { ascending: boolean }): SupabaseQueryPort;
  limit(count: number): SupabaseQueryPort;
}

export interface SupabaseInsertPort {
  select(columns: string): SupabaseQueryPort;
  single(): PromiseLike<SupabaseResult>;
}

export interface SupabaseTablePort {
  select(columns: string): SupabaseQueryPort;
  insert(values: Record<string, unknown>): SupabaseInsertPort;
}

export interface SupabaseBuyerPort {
  auth: {
    getUser(jwt: string): PromiseLike<{
      data: { user: { id: string } | null };
      error: unknown;
    }>;
  };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult>;
}

export interface SupabaseAdminPort {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult>;
  from(table: string): SupabaseTablePort;
}

export interface SupabasePixAdapterOptions {
  /** Request-scoped Supabase client carrying the buyer JWT. */
  buyerClient: SupabaseBuyerPort;
  /** Server-only Supabase client created with service_role. */
  adminClient: SupabaseAdminPort;
  /** Backend-owned source for billing identity; never use frontend input. */
  resolveBuyerProfile?: (userId: string) => Promise<BuyerProfile>;
}

export class SupabaseAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SupabaseAdapterError';
  }
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new SupabaseAdapterError(`Invalid ${context} response`);
  }
  return value as Record<string, unknown>;
}

function rpcRow(data: unknown, context: string): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new SupabaseAdapterError(`Invalid ${context} RPC response`);
  }
  return object(data[0], context);
}

function rpcError(error: unknown, context: string): never {
  void error;
  throw new SupabaseAdapterError(`${context} RPC failed`);
}

async function callRpc(
  client: { rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult> },
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result = await client.rpc(name, args);
  if (result.error) rpcError(result.error, name);
  return rpcRow(result.data, name);
}

function stringField(row: Record<string, unknown>, field: string, context: string): string {
  if (typeof row[field] !== 'string' || row[field].trim() === '') {
    throw new SupabaseAdapterError(`Invalid ${field} in ${context} response`);
  }
  return row[field].trim();
}

function nullableStringField(row: Record<string, unknown>, field: string, context: string): string | null {
  if (row[field] === null) return null;
  return stringField(row, field, context);
}

function numberField(row: Record<string, unknown>, field: string, context: string): number {
  if (typeof row[field] !== 'number' || !Number.isFinite(row[field])) {
    throw new SupabaseAdapterError(`Invalid ${field} in ${context} response`);
  }
  return row[field];
}

function booleanField(row: Record<string, unknown>, field: string, context: string): boolean {
  if (typeof row[field] !== 'boolean') {
    throw new SupabaseAdapterError(`Invalid ${field} in ${context} response`);
  }
  return row[field];
}

function statusField(row: Record<string, unknown>, context: string): PaymentIntentStatus | 'creating' {
  return stringField(row, 'status', context) as PaymentIntentStatus | 'creating';
}

function mapPrepared(row: Record<string, unknown>): PreparedPaymentIntent {
  const context = 'prepare_asaas_payment_intent';
  const currency = stringField(row, 'currency', context);
  const ambiente = stringField(row, 'ambiente', context);
  if (currency !== 'BRL' || ambiente !== 'sandbox') {
    throw new SupabaseAdapterError('Prepared payment environment is invalid');
  }
  return {
    paymentIntentId: stringField(row, 'payment_intent_id', context),
    orderId: stringField(row, 'order_id', context),
    status: statusField(row, context),
    amountDueReal: numberField(row, 'amount_due_real', context),
    currency: 'BRL',
    ambiente: 'sandbox',
    externalReference: stringField(row, 'external_reference', context),
    dueAt: stringField(row, 'due_at', context),
  };
}

function mapClaim(row: Record<string, unknown>): PaymentClaim {
  const context = 'claim_asaas_payment_creation';
  return {
    paymentIntentId: stringField(row, 'payment_intent_id', context),
    status: statusField(row, context),
    claimGranted: booleanField(row, 'claim_granted', context),
    claimToken: nullableStringField(row, 'claim_token', context),
    asaasPaymentId: nullableStringField(row, 'asaas_payment_id', context),
  };
}

function mapCustomer(row: Record<string, unknown>, context: string): StoredCustomer {
  const ambiente = stringField(row, 'ambiente', context);
  const status = stringField(row, 'status', context);
  if (ambiente !== 'sandbox' || !['active', 'inactive', 'needs_review'].includes(status)) {
    throw new SupabaseAdapterError(`Invalid customer state in ${context} response`);
  }
  return {
    id: stringField(row, 'id', context),
    providerCustomerId: stringField(row, 'asaas_customer_id', context),
    status: status as StoredCustomer['status'],
    ambiente: 'sandbox',
  };
}

function ensureAuthenticatedUser(currentUserId: string | null, expectedUserId: string): void {
  if (!currentUserId || currentUserId !== expectedUserId) {
    throw new SupabaseAdapterError('Authenticated buyer context is missing or mismatched');
  }
}

export function createSupabasePixAdapter(options: SupabasePixAdapterOptions): {
  auth: PixAuthenticator<string>;
  db: PaymentDatabase;
} {
  let authenticatedUserId: string | null = null;

  const auth: PixAuthenticator<string> = {
    async authenticate(jwt: string): Promise<AuthenticatedBuyer> {
      if (!jwt.trim()) throw new SupabaseAdapterError('Buyer JWT is required');
      const result = await options.buyerClient.auth.getUser(jwt);
      if (result.error || !result.data.user?.id) {
        throw new SupabaseAdapterError('Buyer JWT is not valid');
      }
      const userId = result.data.user.id;
      authenticatedUserId = userId;
      return { userId };
    },
  };

  const db: PaymentDatabase = {
    async preparePaymentIntent(input) {
      ensureAuthenticatedUser(authenticatedUserId, input.userId);
      const row = await callRpc(options.buyerClient, 'prepare_asaas_payment_intent', {
        p_order_id: input.orderId,
        p_idempotency_key: input.idempotencyKey,
      });
      return mapPrepared(row);
    },

    async claimPaymentCreation(input) {
      const row = await callRpc(options.adminClient, 'claim_asaas_payment_creation', {
        p_payment_intent_id: input.paymentIntentId,
      });
      return mapClaim(row);
    },

    async getCustomer(input) {
      ensureAuthenticatedUser(authenticatedUserId, input.userId);
      const result = await options.adminClient
        .from('asaas_customers')
        .select('id, ambiente, asaas_customer_id, status')
        .eq('user_id', input.userId)
        .eq('ambiente', input.ambiente)
        .maybeSingle();
      if (result.error) rpcError(result.error, 'asaas_customers select');
      if (result.data === null) return null;
      return mapCustomer(object(result.data, 'asaas_customers'), 'asaas_customers');
    },

    async getBuyerProfile(userId) {
      if (!options.resolveBuyerProfile) {
        throw new SupabaseAdapterError('Backend buyer billing profile resolver is not configured');
      }
      ensureAuthenticatedUser(authenticatedUserId, userId);
      return options.resolveBuyerProfile(userId);
    },

    async saveCustomer(input) {
      ensureAuthenticatedUser(authenticatedUserId, input.userId);
      const result = await options.adminClient
        .from('asaas_customers')
        .insert({
          user_id: input.userId,
          ambiente: input.ambiente,
          asaas_customer_id: input.providerCustomerId,
          status: 'active',
        })
        .select('id, ambiente, asaas_customer_id, status')
        .single();
      if (result.error) rpcError(result.error, 'asaas_customers insert');
      return mapCustomer(object(result.data, 'asaas_customers insert'), 'asaas_customers insert');
    },

    async finalizePaymentCreation(input) {
      const row = await callRpc(options.adminClient, 'finalize_asaas_payment_creation', {
        p_payment_intent_id: input.paymentIntentId,
        p_claim_token: input.claimToken,
        p_asaas_payment_id: input.asaasPaymentId,
        p_provider_customer_id: input.providerCustomerId,
        p_provider_status: input.providerStatus,
        p_amount_due_real: input.amountDueReal,
        p_external_reference: input.externalReference,
      });
      if (stringField(row, 'status', 'finalize_asaas_payment_creation') !== 'created') {
        throw new SupabaseAdapterError('Payment finalization returned an unexpected status');
      }
      return {
        status: 'created' as const,
        asaasPaymentId: stringField(row, 'asaas_payment_id', 'finalize_asaas_payment_creation'),
      };
    },

    async failPaymentCreation(input) {
      const row = await callRpc(options.adminClient, 'fail_asaas_payment_creation', {
        p_payment_intent_id: input.paymentIntentId,
        p_claim_token: input.claimToken,
        p_error_code: input.errorCode,
        p_error_message: input.errorMessage ?? input.errorCode,
      });
      if (statusField(row, 'fail_asaas_payment_creation') !== 'failed') {
        throw new SupabaseAdapterError('Payment failure transition returned an unexpected status');
      }
    },

    async markNeedsReconciliation(input) {
      const row = await callRpc(options.adminClient, 'mark_asaas_payment_needs_reconciliation', {
        p_payment_intent_id: input.paymentIntentId,
        p_claim_token: input.claimToken,
        p_error_code: input.errorCode,
        p_error_message: input.errorCode,
      });
      if (statusField(row, 'mark_asaas_payment_needs_reconciliation') !== 'needs_reconciliation') {
        throw new SupabaseAdapterError('Reconciliation transition returned an unexpected status');
      }
    },
  };

  return { auth, db };
}
