import {
  AsaasClientError,
  createAsaasClient,
  createAsaasClientFromEnv,
} from './index.ts';

function assert(condition: unknown, message = 'assertion failed'): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

async function assertRejects<T extends Error>(operation: () => Promise<unknown>, ErrorType: new (...args: never[]) => T, message?: string): Promise<T> {
  try {
    await operation();
  } catch (error) {
    assert(error instanceof ErrorType, `expected ${ErrorType.name}`);
    if (message) assert(error.message.includes(message), `expected error message to include ${message}`);
    return error;
  }
  throw new Error('expected operation to reject');
}

const baseUrl = 'https://api-sandbox.asaas.com/v3';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function clientWith(sequence: Array<Response | Error | ((request: Request) => Promise<Response>)>) {
  let index = 0;
  const requests: Request[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    requests.push(request);
    const next = sequence[index++];
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(request);
    return next;
  };
  return { client: createAsaasClient({ baseUrl, accessToken: 'server-only-token', fetchImpl }), requests };
}

Deno.test('consults or creates customer using injected HTTP transport', async () => {
  const { client, requests } = clientWith([
    response({ data: [{ id: 'cus_1', name: 'Cliente' }] }),
    response({ id: 'cus_2', name: 'Cliente 2', cpfCnpj: '00000000000' }),
  ]);
  assertEquals((await client.findCustomer({ cpfCnpj: '00000000000' }))?.id, 'cus_1');
  assertEquals((await client.createCustomer({ name: 'Cliente 2', cpfCnpj: '00000000000' })).id, 'cus_2');
  assertEquals(new URL(requests[0].url).pathname, '/v3/customers');
  assertEquals(requests[0].headers.get('access_token'), 'server-only-token');
  assertEquals(requests[1].method, 'POST');
});

Deno.test('creates Pix from the trusted backend amount and gets payment and QR code', async () => {
  const { client, requests } = clientWith([
    response({ id: 'pay_1', customer: 'cus_1', value: 12.34, status: 'PENDING', billingType: 'PIX', externalReference: 'gemn-order-1' }),
    response({ id: 'pay_1', customer: 'cus_1', value: 12.34, status: 'PENDING', billingType: 'PIX', externalReference: 'gemn-order-1' }),
    response({ encodedImage: 'base64-image', payload: 'pix-payload', expirationDate: '2026-10-19' }),
  ]);
  await client.createPixPayment({ customerId: 'cus_1', amountDueReal: 12.34, dueDate: '2026-10-19', externalReference: 'gemn-order-1' });
  await client.getPayment('pay_1');
  assertEquals(await client.getPixQrCode('pay_1'), { encodedImage: 'base64-image', payload: 'pix-payload', expirationDate: '2026-10-19' });
  const paymentBody = await requests[0].clone().json();
  assertEquals(paymentBody.value, 12.34);
  assertEquals(paymentBody.billingType, 'PIX');
});

Deno.test('maps HTTP failures, invalid responses and zero value without retrying', async () => {
  const http = clientWith([response({ errors: [{ code: 'invalid_due_date', description: 'due date is invalid' }] }, 400)]);
  const error = await assertRejects(() => http.client.getPayment('pay_1'), AsaasClientError, 'Asaas request failed');
  assertEquals(error.status, 400);
  assertEquals(error.providerCode, 'invalid_due_date');
  assertEquals(error.providerMessage, 'due date is invalid');
  assert(error.correlationId.length > 20);
  assertEquals(http.requests[0].headers.get('x-correlation-id'), error.correlationId);

  const invalid = clientWith([response({ data: 'not-an-array' })]).client;
  await assertRejects(() => invalid.findCustomer({ cpfCnpj: '00000000000' }), AsaasClientError, 'lookup is invalid');

  const zero = clientWith([]).client;
  await assertRejects(() => zero.createPixPayment({ customerId: 'cus_1', amountDueReal: 0, dueDate: '2026-10-19', externalReference: 'ref' }), AsaasClientError, 'greater than zero');
});

Deno.test('marks POST timeout as uncertain and never retries', async () => {
  let calls = 0;
  const client = createAsaasClient({
    baseUrl,
    accessToken: 'server-only-token',
    timeoutMs: 5,
    fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
      calls++;
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  });
  const error = await assertRejects(() => client.createPixPayment({ customerId: 'cus_1', amountDueReal: 10, dueDate: '2026-10-19', externalReference: 'ref' }), AsaasClientError);
  assertEquals(error.code, 'TIMEOUT');
  assert(error.uncertain);
  assertEquals(calls, 1);
});

Deno.test('rejects divergent external reference and amount', async () => {
  const reference = clientWith([response({ id: 'pay_1', customer: 'cus_1', value: 10, status: 'PENDING', billingType: 'PIX', externalReference: 'other' })]).client;
  const referenceError = await assertRejects(() => reference.createPixPayment({ customerId: 'cus_1', amountDueReal: 10, dueDate: '2026-10-19', externalReference: 'expected' }), AsaasClientError);
  assertEquals(referenceError.code, 'REFERENCE_MISMATCH');

  const amount = clientWith([response({ id: 'pay_1', customer: 'cus_1', value: 10.01, status: 'PENDING', billingType: 'PIX', externalReference: 'expected' })]).client;
  const amountError = await assertRejects(() => amount.createPixPayment({ customerId: 'cus_1', amountDueReal: 10, dueDate: '2026-10-19', externalReference: 'expected' }), AsaasClientError);
  assertEquals(amountError.code, 'AMOUNT_MISMATCH');
});

Deno.test('reads only the two server environment variables', () => {
  const reads: string[] = [];
  const client = createAsaasClientFromEnv({
    get(name: string) {
      reads.push(name);
      return name === 'ASAAS_BASE_URL' ? baseUrl : name === 'ASAAS_ACCESS_TOKEN' ? 'server-only-token' : undefined;
    },
  }, async () => response({ data: [] }));
  assert(client);
  assertEquals(reads, ['ASAAS_BASE_URL', 'ASAAS_ACCESS_TOKEN']);
});
