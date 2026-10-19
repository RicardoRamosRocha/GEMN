import {
  createPixOrchestrator,
  PixOrchestrationError,
  type PaymentDatabase,
  type PixOrchestratorDependencies,
} from './index.ts';
import { AsaasClientError, type AsaasClient } from '../asaas-client/index.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects<T extends Error>(operation: () => Promise<unknown>, ErrorType: new (...args: never[]) => T, code: string): Promise<T> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof ErrorType, `expected ${ErrorType.name}`);
    assertEquals((error as T & { code: string }).code, code);
    return error as T;
  }
  throw new Error('expected operation to reject');
}

const baseIntent = {
  paymentIntentId: 'intent-1',
  orderId: 'order-1',
  status: 'pending_creation' as const,
  amountDueReal: 25,
  currency: 'BRL' as const,
  ambiente: 'sandbox' as const,
  externalReference: 'gemn-order-order-1',
  dueAt: '2026-10-19T12:00:00.000Z',
};

function makeDependencies(overrides: Partial<{
  auth: PixOrchestratorDependencies['auth'];
  db: Partial<PaymentDatabase>;
  asaas: Partial<AsaasClient>;
}> = {}) {
  const calls: string[] = [];
  const defaultPrepare: PaymentDatabase['preparePaymentIntent'] = async () => ({ ...baseIntent });
  const defaultClaim: PaymentDatabase['claimPaymentCreation'] = async () => ({ paymentIntentId: 'intent-1', status: 'creating', claimGranted: true, claimToken: 'claim-1', asaasPaymentId: null });
  const defaultFinalize: PaymentDatabase['finalizePaymentCreation'] = async ({ asaasPaymentId }) => ({ status: 'created', asaasPaymentId });
  const defaultFail: PaymentDatabase['failPaymentCreation'] = async () => undefined;
  const defaultReconcile: PaymentDatabase['markNeedsReconciliation'] = async () => undefined;
  const prepare = overrides.db?.preparePaymentIntent ?? defaultPrepare;
  const claim = overrides.db?.claimPaymentCreation ?? defaultClaim;
  const finalize = overrides.db?.finalizePaymentCreation ?? defaultFinalize;
  const fail = overrides.db?.failPaymentCreation ?? defaultFail;
  const reconcile = overrides.db?.markNeedsReconciliation ?? defaultReconcile;
  const db: PaymentDatabase = {
    preparePaymentIntent: async (input) => { calls.push('prepare'); return prepare(input); },
    claimPaymentCreation: async (input) => { calls.push('claim'); return claim(input); },
    getCustomer: async () => { calls.push('getCustomer'); return null; },
    getBuyerProfile: async () => { calls.push('profile'); return { name: 'Buyer', cpfCnpj: '00000000000' }; },
    saveCustomer: async ({ providerCustomerId }) => { calls.push('saveCustomer'); return { id: 'local-customer-1', providerCustomerId, status: 'active', ambiente: 'sandbox' }; },
    finalizePaymentCreation: async (input) => { calls.push('finalize'); return finalize(input); },
    failPaymentCreation: async (input) => { calls.push('fail'); return fail(input); },
    markNeedsReconciliation: async (input) => { calls.push('reconcile'); return reconcile(input); },
  };
  const defaultFindCustomer: AsaasClient['findCustomer'] = async () => null;
  const defaultCreateCustomer: AsaasClient['createCustomer'] = async () => ({ id: 'provider-customer-1', name: 'Buyer' });
  const defaultCreatePixPayment: AsaasClient['createPixPayment'] = async () => ({ id: 'payment-1', customer: 'provider-customer-1', value: 25, status: 'PENDING', billingType: 'PIX', externalReference: baseIntent.externalReference });
  const findCustomer = overrides.asaas?.findCustomer ?? defaultFindCustomer;
  const createCustomer = overrides.asaas?.createCustomer ?? defaultCreateCustomer;
  const createPixPayment = overrides.asaas?.createPixPayment ?? defaultCreatePixPayment;
  const asaas: AsaasClient = {
    findCustomer: async (input) => { calls.push('findAsaasCustomer'); return findCustomer(input); },
    createCustomer: async (input) => { calls.push('createAsaasCustomer'); return createCustomer(input); },
    createPixPayment: async (input) => { calls.push('postPix'); return createPixPayment(input); },
    getPayment: async () => { throw new Error('not used'); },
    getPixQrCode: async () => { throw new Error('not used'); },
  };
  const authenticate = overrides.auth?.authenticate ?? (async () => ({ userId: 'buyer-1' }));
  const auth = { authenticate: async (context: unknown) => { calls.push('auth'); return authenticate(context); } };
  return { dependencies: { auth, db, asaas }, calls };
}

Deno.test('executes auth -> prepare -> claim -> customer -> POST -> finalize', async () => {
  const { dependencies, calls } = makeDependencies();
  const result = await createPixOrchestrator(dependencies).create({ context: 'request', orderId: 'order-1', idempotencyKey: 'key-1' });
  assertEquals(result, { outcome: 'created', paymentIntentId: 'intent-1', asaasPaymentId: 'payment-1', amountDueReal: 25, externalReference: baseIntent.externalReference, providerStatus: 'PENDING' });
  assertEquals(calls, ['auth', 'prepare', 'claim', 'getCustomer', 'profile', 'findAsaasCustomer', 'createAsaasCustomer', 'saveCustomer', 'postPix', 'finalize']);
});

Deno.test('reuses an existing payment and does not resolve customer or POST', async () => {
  const { dependencies, calls } = makeDependencies({ db: {
    preparePaymentIntent: async () => ({ ...baseIntent, status: 'created' }),
    claimPaymentCreation: async () => ({ paymentIntentId: 'intent-1', status: 'created', claimGranted: false, claimToken: null, asaasPaymentId: 'payment-existing' }),
  } });
  const result = await createPixOrchestrator(dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' });
  assertEquals(result, { outcome: 'reused', paymentIntentId: 'intent-1', asaasPaymentId: 'payment-existing', status: 'created' });
  assertEquals(calls, ['auth', 'prepare', 'claim']);
  assertEquals(calls.filter((call) => call === 'postPix').length, 0);
});

Deno.test('maps logical concurrency to in-progress without POST', async () => {
  const { dependencies, calls } = makeDependencies({ db: {
    claimPaymentCreation: async () => ({ paymentIntentId: 'intent-1', status: 'creating', claimGranted: false, claimToken: null, asaasPaymentId: null }),
  } });
  await assertRejects(() => createPixOrchestrator(dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'PAYMENT_ALREADY_IN_PROGRESS');
  assertEquals(calls, ['auth', 'prepare', 'claim']);
  assertEquals(calls.filter((call) => call === 'postPix').length, 0);
});

Deno.test('rejects zero, canceled/expired/not-eligible responses before claim', async () => {
  const zero = makeDependencies({ db: { preparePaymentIntent: async () => ({ ...baseIntent, amountDueReal: 0 }) } });
  await assertRejects(() => createPixOrchestrator(zero.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'ORDER_NOT_ELIGIBLE');
  assert(!zero.calls.includes('claim'));
  assertEquals(zero.calls.filter((call) => call === 'postPix').length, 0);

  const canceled = makeDependencies({ db: { preparePaymentIntent: async () => ({ ...baseIntent, status: 'canceled' }) } });
  await assertRejects(() => createPixOrchestrator(canceled.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'ORDER_NOT_ELIGIBLE');
  assert(!canceled.calls.includes('postPix'));
  assertEquals(canceled.calls.filter((call) => call === 'postPix').length, 0);

  const expired = makeDependencies({ db: { preparePaymentIntent: async () => ({ ...baseIntent, status: 'overdue' }) } });
  await assertRejects(() => createPixOrchestrator(expired.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'ORDER_NOT_ELIGIBLE');
  assert(!expired.calls.includes('claim'));
  assertEquals(expired.calls.filter((call) => call === 'postPix').length, 0);
});

Deno.test('maps authentication and known Asaas rejection without reconciliation', async () => {
  const unauthenticated = makeDependencies({ auth: { authenticate: async () => { throw new Error('invalid token'); } } });
  await assertRejects(() => createPixOrchestrator(unauthenticated.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'UNAUTHORIZED');
  assertEquals(unauthenticated.calls, ['auth']);

  const rejected = makeDependencies({ asaas: {
    createPixPayment: async () => { throw new AsaasClientError('HTTP_ERROR', 'rejected', { status: 400 }); },
  } });
  await assertRejects(() => createPixOrchestrator(rejected.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'ASAAS_REJECTED');
  assertEquals(rejected.calls.filter((call) => call === 'postPix' || call === 'fail' || call === 'reconcile'), ['postPix', 'fail']);
  assertEquals(rejected.calls.filter((call) => call === 'postPix').length, 1);
});

Deno.test('routes timeout to needs_reconciliation and never retries POST', async () => {
  const { dependencies, calls } = makeDependencies({ asaas: {
    createPixPayment: async () => { throw new AsaasClientError('TIMEOUT', 'timeout', { uncertain: true }); },
  } });
  await assertRejects(() => createPixOrchestrator(dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'PAYMENT_NEEDS_RECONCILIATION');
  assertEquals(calls.filter((call) => call === 'postPix' || call === 'reconcile'), ['postPix', 'reconcile']);
  assertEquals(calls.filter((call) => call === 'postPix').length, 1);
});

Deno.test('routes Asaas timeout and finalization failure to reconciliation', async () => {
  const timeout = makeDependencies({ asaas: {
    createPixPayment: async () => { throw new AsaasClientError('TIMEOUT', 'timeout', { uncertain: true }); },
  } });
  await assertRejects(() => createPixOrchestrator(timeout.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'PAYMENT_NEEDS_RECONCILIATION');
  assertEquals(timeout.calls.filter((call) => call === 'postPix' || call === 'reconcile'), ['postPix', 'reconcile']);
  assertEquals(timeout.calls.filter((call) => call === 'postPix').length, 1);

  const finalization = makeDependencies({ db: {
    finalizePaymentCreation: async () => { throw new Error('database unavailable'); },
  } });
  await assertRejects(() => createPixOrchestrator(finalization.dependencies).create({ context: null, orderId: 'order-1', idempotencyKey: 'key-1' }), PixOrchestrationError, 'PAYMENT_NEEDS_RECONCILIATION');
  assertEquals(finalization.calls.filter((call) => call === 'postPix' || call === 'finalize' || call === 'reconcile'), ['postPix', 'finalize', 'reconcile']);
  assertEquals(finalization.calls.filter((call) => call === 'postPix').length, 1);
});
