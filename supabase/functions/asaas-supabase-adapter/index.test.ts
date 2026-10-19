import {
  createSupabasePixAdapter,
  SupabaseAdapterError,
  type SupabaseAdminPort,
  type SupabaseBuyerPort,
  type SupabaseQueryPort,
} from './index.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects(operation: () => Promise<unknown>, codeFragment: string): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof SupabaseAdapterError, 'expected SupabaseAdapterError');
    assert(error.message.includes(codeFragment), `expected error to include ${codeFragment}`);
    return;
  }
  throw new Error('expected operation to reject');
}

function result(data: unknown, error: unknown = null) {
  return { data, error };
}

function makeRpcClient(
  authUser: string | null,
  buyerRpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  adminRpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
) {
  const buyerCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const adminCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const buyerClient: SupabaseBuyerPort = {
    auth: {
      async getUser(jwt) {
        if (jwt !== 'valid-jwt') return { data: { user: null }, error: new Error('invalid jwt') };
        return { data: { user: authUser ? { id: authUser } : null }, error: null };
      },
    },
    async rpc(name, args) {
      buyerCalls.push({ name, args });
      return buyerRpc(name, args);
    },
  };
  const adminClient: SupabaseAdminPort = {
    async rpc(name, args) {
      adminCalls.push({ name, args });
      return adminRpc(name, args);
    },
    from() {
      throw new Error('table mock not configured');
    },
  };
  return { buyerClient, adminClient, buyerCalls, adminCalls };
}

function tableMock(
  calls: Array<{ operation: string; value?: unknown }>,
  response: { data: unknown; error: unknown },
): SupabaseQueryPort {
  const query: SupabaseQueryPort = {
    select(columns) { calls.push({ operation: 'select', value: columns }); return query; },
    eq(column, value) { calls.push({ operation: 'eq', value: { column, value } }); return query; },
    insert(values) { calls.push({ operation: 'insert', value: values }); return query; },
    async maybeSingle() { calls.push({ operation: 'maybeSingle' }); return response; },
    async single() { calls.push({ operation: 'single' }); return response; },
  };
  return query;
}

const preparedRow = [{
  payment_intent_id: 'intent-1',
  order_id: 'order-1',
  status: 'pending_creation',
  amount_due_real: 42.5,
  currency: 'BRL',
  ambiente: 'sandbox',
  external_reference: 'gemn-order-order-1',
  due_at: '2026-10-19T12:00:00.000Z',
}];

Deno.test('validates buyer JWT and does not trust a frontend buyer_id', async () => {
  const clients = makeRpcClient('buyer-1', async () => result(preparedRow), async () => result([]));
  const adapter = createSupabasePixAdapter(clients);
  await assertRejects(() => adapter.auth.authenticate('invalid-jwt'), 'not valid');
  await adapter.auth.authenticate('valid-jwt');
  const prepared = await adapter.db.preparePaymentIntent({ userId: 'buyer-1', orderId: 'order-1', idempotencyKey: 'key-1' });
  assertEquals(prepared.amountDueReal, 42.5);
  assertEquals(clients.buyerCalls, [{ name: 'prepare_asaas_payment_intent', args: { p_order_id: 'order-1', p_idempotency_key: 'key-1' } }]);
  await assertRejects(() => adapter.db.preparePaymentIntent({ userId: 'frontend-supplied-buyer', orderId: 'order-1', idempotencyKey: 'key-1' }), 'mismatched');
  assertEquals(clients.adminCalls, []);
});

Deno.test('rejects invalid prepare RPC data and keeps claims on admin client', async () => {
  const clients = makeRpcClient('buyer-1', async () => result([{ ...preparedRow[0], amount_due_real: '42.50' }]), async () => result([{}]));
  const adapter = createSupabasePixAdapter(clients);
  await adapter.auth.authenticate('valid-jwt');
  await assertRejects(() => adapter.db.preparePaymentIntent({ userId: 'buyer-1', orderId: 'order-1', idempotencyKey: 'key-1' }), 'amount_due_real');

  const validClaim = [{ payment_intent_id: 'intent-1', status: 'creating', claim_granted: true, claim_token: 'claim-1', asaas_payment_id: null }];
  const claimClients = makeRpcClient('buyer-1', async () => result(preparedRow), async () => result(validClaim));
  const claimAdapter = createSupabasePixAdapter(claimClients);
  const claim = await claimAdapter.db.claimPaymentCreation({ paymentIntentId: 'intent-1' });
  assertEquals(claim.claimGranted, true);
  assertEquals(claimClients.buyerCalls, []);
  assertEquals(claimClients.adminCalls, [{ name: 'claim_asaas_payment_creation', args: { p_payment_intent_id: 'intent-1' } }]);
});

Deno.test('maps exact finalize, fail and reconciliation RPC contracts to service-role client', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const clients = makeRpcClient('buyer-1', async () => result(preparedRow), async (name, args) => {
    calls.push({ name, args });
    if (name === 'finalize_asaas_payment_creation') return result([{ payment_intent_id: 'intent-1', status: 'created', asaas_payment_id: 'pay-1', amount_due_real: 42.5, external_reference: 'gemn-order-order-1' }]);
    if (name === 'fail_asaas_payment_creation') return result([{ payment_intent_id: 'intent-1', status: 'failed' }]);
    return result([{ payment_intent_id: 'intent-1', status: 'needs_reconciliation' }]);
  });
  const adapter = createSupabasePixAdapter(clients);
  const finalized = await adapter.db.finalizePaymentCreation({ paymentIntentId: 'intent-1', claimToken: 'claim-1', asaasPaymentId: 'pay-1', providerCustomerId: 'cus-1', providerStatus: 'PENDING', amountDueReal: 42.5, externalReference: 'gemn-order-order-1' });
  await adapter.db.failPaymentCreation({ paymentIntentId: 'intent-1', claimToken: 'claim-1', errorCode: 'ASAAS_REJECTED' });
  await adapter.db.markNeedsReconciliation({ paymentIntentId: 'intent-1', claimToken: 'claim-1', errorCode: 'ASAAS_TIMEOUT' });
  assertEquals(finalized, { status: 'created', asaasPaymentId: 'pay-1' });
  assertEquals(calls, [
    { name: 'finalize_asaas_payment_creation', args: { p_payment_intent_id: 'intent-1', p_claim_token: 'claim-1', p_asaas_payment_id: 'pay-1', p_provider_customer_id: 'cus-1', p_provider_status: 'PENDING', p_amount_due_real: 42.5, p_external_reference: 'gemn-order-order-1' } },
    { name: 'fail_asaas_payment_creation', args: { p_payment_intent_id: 'intent-1', p_claim_token: 'claim-1', p_error_code: 'ASAAS_REJECTED', p_error_message: 'ASAAS_REJECTED' } },
    { name: 'mark_asaas_payment_needs_reconciliation', args: { p_payment_intent_id: 'intent-1', p_claim_token: 'claim-1', p_error_code: 'ASAAS_TIMEOUT', p_error_message: 'ASAAS_TIMEOUT' } },
  ]);
});

Deno.test('maps customer persistence through admin tables and requires backend profile source', async () => {
  const tableCalls: Array<{ operation: string; value?: unknown }> = [];
  const clients = makeRpcClient('buyer-1', async () => result(preparedRow), async () => result([]));
  clients.adminClient.from = () => tableMock(tableCalls, result({ id: 'local-1', ambiente: 'sandbox', asaas_customer_id: 'cus-1', status: 'active' }));
  const adapter = createSupabasePixAdapter(clients);
  await adapter.auth.authenticate('valid-jwt');
  const stored = await adapter.db.getCustomer({ userId: 'buyer-1', ambiente: 'sandbox' });
  assertEquals(stored, { id: 'local-1', providerCustomerId: 'cus-1', status: 'active', ambiente: 'sandbox' });
  const saved = await adapter.db.saveCustomer({ userId: 'buyer-1', ambiente: 'sandbox', providerCustomerId: 'cus-1' });
  assertEquals(saved.providerCustomerId, 'cus-1');
  await assertRejects(() => adapter.db.getBuyerProfile('buyer-1'), 'profile resolver');
  assert(tableCalls.some((call) => call.operation === 'insert'));
});
