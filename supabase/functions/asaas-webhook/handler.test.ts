import {
  createAsaasWebhookHandler,
  sha256Hex,
  type AsaasWebhookPersistenceInput,
  type AsaasWebhookPersistenceResult,
} from "./handler.ts";

const webhookToken = "w".repeat(32);

const persistedResult: AsaasWebhookPersistenceResult = {
  webhook_event_id: "00000000-0000-0000-0000-000000000001",
  duplicate: false,
  hash_conflict: false,
  persisted: true,
  processing_status: "needs_review",
  reason_code: "PAYMENT_INTENT_NOT_FOUND",
  payment_intent_id: null,
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function environment(token: string | undefined): Pick<Deno.Env, "get"> {
  return { get: (name: string) => name === "ASAAS_WEBHOOK_AUTH_TOKEN" ? token : undefined };
}

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "evt_test_001",
    event: "PAYMENT_RECEIVED",
    dateCreated: "2026-10-21T12:34:56.000Z",
    payment: {
      id: "pay_test_001",
      status: "RECEIVED",
      value: 25,
      netValue: 24.5,
      externalReference: "gemn-order-test-001",
    },
    ...overrides,
  };
}

function request(body: unknown, init: RequestInit = {}): Request {
  const headers = new Headers({
    "asaas-access-token": webhookToken,
    "content-type": "application/json",
  });
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  return new Request("https://edge.test/asaas-webhook", {
    method: "POST",
    ...init,
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function harness(
  persist: (input: AsaasWebhookPersistenceInput) => Promise<AsaasWebhookPersistenceResult>,
  options: { token?: string; missingToken?: boolean; maxBodyBytes?: number } = {},
) {
  const calls: AsaasWebhookPersistenceInput[] = [];
  const handler = createAsaasWebhookHandler({
    env: environment(options.missingToken ? undefined : options.token ?? webhookToken),
    maxBodyBytes: options.maxBodyBytes,
    async persist(input) {
      calls.push(input);
      return await persist(input);
    },
  });
  return { calls, handler };
}

function validHarness() {
  return harness(async () => persistedResult);
}

Deno.test("persists a valid event and returns 200 only after confirmation", async () => {
  const { calls, handler } = validHarness();
  const body = JSON.stringify(payload());
  const response = await handler(request(body));
  const result = await responseBody(response);

  assertEquals(response.status, 200, "status");
  assertEquals(result.ok, true, "ok");
  assertEquals(calls.length, 1, "persistence calls");
  assertEquals(calls[0].p_asaas_event_id, "evt_test_001", "event id");
  assertEquals(calls[0].p_event_type, "PAYMENT_RECEIVED", "event type");
  assertEquals(calls[0].p_asaas_payment_id, "pay_test_001", "payment id");
  assertEquals(calls[0].p_external_reference, "gemn-order-test-001", "external reference");
  assertEquals(calls[0].p_provider_status, "RECEIVED", "provider status");
  assertEquals(calls[0].p_payment_value, 25, "payment value");
  assertEquals(calls[0].p_net_value, 24.5, "net value");
  assert(calls[0].p_occurred_at === "2026-10-21T12:34:56.000000Z", "occurred_at was normalized safely");
  assertEquals(calls[0].p_source_date_created, "2026-10-21T12:34:56.000Z", "source date");
  assert(/^[0-9a-f]{64}$/.test(calls[0].p_payload_hash), "payload hash is hexadecimal SHA-256");
  assertEquals(calls[0].p_payload_hash, await sha256Hex(new TextEncoder().encode(body)), "payload hash");
});

Deno.test("normalizes positive and negative offsets without changing the source evidence", async () => {
  const cases = [
    ["2026-10-21T12:34:56.123456+03:00", "2026-10-21T09:34:56.123456Z"],
    ["2026-10-21T12:34:56.123456-03:00", "2026-10-21T15:34:56.123456Z"],
  ] as const;

  for (const [dateCreated, occurredAt] of cases) {
    const { calls, handler } = validHarness();
    const response = await handler(request(payload({ dateCreated })));
    assertEquals(response.status, 200, "offset status");
    assertEquals(calls[0].p_source_date_created, dateCreated, "source date");
    assertEquals(calls[0].p_occurred_at, occurredAt, "normalized occurred_at");
  }
});

Deno.test("preserves fractions across UTC day and year boundaries", async () => {
  const cases = [
    ["2026-01-01T00:00:00.123456+02:00", "2025-12-31T22:00:00.123456Z"],
    ["2026-12-31T23:59:59.1-03:00", "2027-01-01T02:59:59.100000Z"],
  ] as const;

  for (const [dateCreated, occurredAt] of cases) {
    const { calls, handler } = validHarness();
    const response = await handler(request(payload({ dateCreated })));
    assertEquals(response.status, 200, "boundary date status");
    assertEquals(calls[0].p_source_date_created, dateCreated, "boundary source date");
    assertEquals(calls[0].p_occurred_at, occurredAt, "boundary UTC instant");
  }
});

Deno.test("delegates an unknown event with valid payment structure to durable review", async () => {
  const { calls, handler } = validHarness();
  const response = await handler(request(payload({ event: "PAYMENT_VENDOR_EXTENSION" })));

  assertEquals(response.status, 200, "status");
  assertEquals(calls.length, 1, "persistence calls");
  assertEquals(calls[0].p_event_type, "PAYMENT_VENDOR_EXTENSION", "event type");
});

Deno.test("accepts a persisted duplicate or conflict result without exposing details", async () => {
  const { handler } = harness(async () => ({
    ...persistedResult,
    duplicate: true,
    hash_conflict: true,
    reason_code: "DUPLICATE_HASH_CONFLICT",
  }));
  const response = await handler(request(payload()));
  const result = await responseBody(response);

  assertEquals(response.status, 200, "status");
  assertEquals(JSON.stringify(result), JSON.stringify({ ok: true }), "public response");
});

Deno.test("rejects missing or invalid authentication before persistence", async () => {
  const body = JSON.stringify(payload());
  const cases = [
    new Request("https://edge.test/asaas-webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    }),
    new Request("https://edge.test/asaas-webhook", {
      method: "POST",
      headers: { "content-type": "application/json", "asaas-access-token": "wrong" },
      body,
    }),
  ];
  for (const headers of cases) {
    const { calls, handler } = validHarness();
    const response = await handler(headers);
    assertEquals(response.status, 401, "authentication status");
    assertEquals(calls.length, 0, "persistence calls");
  }
});

Deno.test("rejects invalid configuration without exposing the secret", async () => {
  const { calls, handler } = harness(async () => persistedResult, { token: "short" });
  const response = await handler(request(payload()));
  const result = await responseBody(response);

  assertEquals(response.status, 500, "configuration status");
  assertEquals(result.error, "CONFIGURATION_INVALID", "configuration error");
  assertEquals(calls.length, 0, "persistence calls");

  const missing = harness(async () => persistedResult, { missingToken: true });
  const missingResponse = await missing.handler(request(payload()));
  assertEquals(missingResponse.status, 500, "missing configuration status");
  assertEquals(missing.calls.length, 0, "missing configuration persistence calls");
});

Deno.test("rejects non-POST and non-JSON requests", async () => {
  const { handler } = validHarness();
  const getResponse = await handler(new Request("https://edge.test/asaas-webhook", { method: "GET" }));
  assertEquals(getResponse.status, 405, "method status");

  const contentTypeResponse = await handler(request(payload(), {
    headers: { "content-type": "text/plain" },
  }));
  assertEquals(contentTypeResponse.status, 415, "content type status");
});

Deno.test("rejects malformed, oversized, and non-object JSON", async () => {
  const malformed = validHarness();
  assertEquals(
    (await malformed.handler(request("{"))).status,
    400,
    "malformed JSON status",
  );

  const nonObject = validHarness();
  assertEquals(
    (await nonObject.handler(request("[]"))).status,
    400,
    "non-object status",
  );

  const oversized = harness(async () => persistedResult, { maxBodyBytes: 10 });
  assertEquals(
    (await oversized.handler(request(JSON.stringify(payload())))).status,
    413,
    "oversized status",
  );

  const invalidUtf8 = validHarness();
  const invalidUtf8Request = new Request("https://edge.test/asaas-webhook", {
    method: "POST",
    headers: {
      "asaas-access-token": webhookToken,
      "content-type": "application/json",
    },
    body: new Uint8Array([0xc3, 0x28]),
  });
  assertEquals(
    (await invalidUtf8.handler(invalidUtf8Request)).status,
    400,
    "invalid UTF-8 status",
  );
});

Deno.test("rejects invalid payment fields and overlong strings", async () => {
  const cases: Record<string, unknown>[] = [
    payload({ payment: { ...payload().payment as Record<string, unknown>, value: -1 } }),
    payload({ payment: { ...payload().payment as Record<string, unknown>, value: "25" } }),
    payload({ payment: { ...payload().payment as Record<string, unknown>, netValue: -1 } }),
    payload({ id: "e".repeat(256) }),
    payload({ payment: { ...payload().payment as Record<string, unknown>, id: "p".repeat(256) } }),
  ];
  for (const body of cases) {
    const { calls, handler } = validHarness();
    const response = await handler(request(body));
    assertEquals(response.status, 400, "invalid field status");
    assertEquals(calls.length, 0, "persistence calls");
  }
});

Deno.test("persists an official timezone-less date as evidence without assuming a timezone", async () => {
  for (const dateCreated of ["2026-10-21 12:34:56.123456", "2026-10-21T12:34:56.1"]) {
    const { calls, handler } = validHarness();
    const response = await handler(request(payload({ dateCreated })));

    assertEquals(response.status, 200, "ambiguous date status");
    assertEquals(calls.length, 1, "persistence calls");
    assertEquals(calls[0].p_source_date_created, dateCreated, "ambiguous source date");
    assertEquals(calls[0].p_occurred_at, null, "ambiguous occurred_at");
  }
});

Deno.test("rejects impossible, unsupported, and overlong dateCreated values", async () => {
  const cases = [
    "2026-02-30 12:34:56",
    "2026/10/21 12:34:56",
    "2026-10-21T12:34:56+24:00",
    "2026-10-21T12:34:56-03:60",
    "2026-10-21T12:34:56.1234567Z",
    "2".repeat(65),
  ];

  for (const dateCreated of cases) {
    const { calls, handler } = validHarness();
    const response = await handler(request(payload({ dateCreated })));
    assertEquals(response.status, 400, "invalid date status");
    assertEquals(calls.length, 0, "invalid date persistence calls");
  }
});

Deno.test("returns 503 when persistence fails or is not confirmed", async () => {
  const failed = harness(async () => {
    throw new Error("database unavailable");
  });
  assertEquals((await failed.handler(request(payload()))).status, 503, "persistence failure status");

  const unconfirmed = harness(async () => ({ ...persistedResult, persisted: false }));
  assertEquals((await unconfirmed.handler(request(payload()))).status, 503, "unconfirmed status");
});
