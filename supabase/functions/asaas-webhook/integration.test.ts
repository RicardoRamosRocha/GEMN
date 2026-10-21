import {
  createAsaasWebhookHandler,
  type AsaasWebhookPersistenceResult,
} from "./handler.ts";
import {
  createAsaasWebhookPersistence,
  type SupabaseRpcPort,
} from "./index.ts";

const TOKEN = "synthetic-webhook-token-012345678901234567890";
const EVENT_ID = "evt_integration_synthetic";
const PAYMENT_ID = "pay_integration_synthetic";
const DATE_WITH_OFFSET = "2026-10-21T12:34:56-03:00";
const DATE_WITHOUT_OFFSET = "2026-10-21 12:34:56";

const rpcResult = (overrides: Partial<AsaasWebhookPersistenceResult> = {}) => [{
  webhook_event_id: "00000000-0000-4000-8000-000000000010",
  duplicate: false,
  hash_conflict: false,
  persisted: true,
  processing_status: "needs_review",
  reason_code: "PAYMENT_INTENT_NOT_FOUND",
  payment_intent_id: null,
  ...overrides,
}];

const payload = (dateCreated: string = DATE_WITH_OFFSET) => ({
  id: EVENT_ID,
  event: "PAYMENT_RECEIVED",
  dateCreated,
  payment: {
    id: PAYMENT_ID,
    status: "RECEIVED",
    value: 25,
    netValue: 24.5,
    externalReference: "synthetic-reference",
  },
});

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function httpHandler(persist: (input: Parameters<NonNullable<Parameters<typeof createAsaasWebhookHandler>[0]["persist"]>>[0]) => Promise<AsaasWebhookPersistenceResult>) {
  return createAsaasWebhookHandler({
    persist,
    env: { get: (name: string) => name === "ASAAS_WEBHOOK_AUTH_TOKEN" ? TOKEN : undefined },
  });
}

function request(body: unknown, token = TOKEN): Request {
  return new Request("http://localhost/asaas-webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "asaas-access-token": token,
    },
    body: JSON.stringify(body),
  });
}

Deno.test("HTTP to adapter persists an explicit-offset event", async () => {
  let captured: Record<string, unknown> | undefined;
  const rpc: SupabaseRpcPort = {
    async rpc(name, args) {
      assert(name === "ingest_asaas_webhook_event_v2", "unexpected RPC name");
      captured = args;
      return { data: rpcResult(), error: null };
    },
  };
  const response = await httpHandler(createAsaasWebhookPersistence(rpc))(request(payload()));
  const body = await responseBody(response);
  assert(response.status === 200 && body.ok === true, "confirmed persistence was not acknowledged");
  assert(captured?.p_occurred_at === "2026-10-21T15:34:56.000000Z", "offset was not normalized to UTC");
  assert(captured?.p_source_date_created === DATE_WITH_OFFSET, "source date evidence changed");
});

Deno.test("HTTP to adapter preserves a timezone-less date as evidence", async () => {
  let captured: Record<string, unknown> | undefined;
  const response = await httpHandler(createAsaasWebhookPersistence({
    async rpc(_name, args) {
      captured = args;
      return { data: rpcResult(), error: null };
    },
  }))(request(payload(DATE_WITHOUT_OFFSET)));
  assert(response.status === 200, "persisted ambiguous date was not acknowledged");
  assert(captured?.p_occurred_at === null, "ambiguous date acquired an invented instant");
  assert(captured?.p_source_date_created === DATE_WITHOUT_OFFSET, "ambiguous evidence changed");
});

Deno.test("authentication and payload validation prevent persistence", async () => {
  let calls = 0;
  const handler = httpHandler(async () => {
    calls += 1;
    return { ...rpcResult()[0] };
  });
  const unauthorized = await handler(request(payload(), "wrong-synthetic-token"));
  const invalid = await handler(request({ ...payload(), dateCreated: "not-a-date" }));
  assert(unauthorized.status === 401, "invalid token was accepted");
  assert(invalid.status === 400, "invalid payload was accepted");
  assert(calls === 0, "invalid requests reached persistence");
});

Deno.test("duplicate and hash-conflict results are acknowledged only when persisted", async () => {
  for (const result of [
    { duplicate: true, hash_conflict: false, reason_code: "DUPLICATE_SAME_HASH" },
    { duplicate: true, hash_conflict: true, reason_code: "DUPLICATE_HASH_CONFLICT" },
  ]) {
    const handler = httpHandler(async () => ({ ...rpcResult(result)[0] }));
    const response = await handler(request(payload()));
    assert(response.status === 200, `${result.reason_code} was not acknowledged after persistence`);
  }
  const unconfirmed = httpHandler(async () => ({ ...rpcResult({ persisted: false })[0] }));
  const response = await unconfirmed(request(payload()));
  assert(response.status === 503, "unconfirmed persistence returned HTTP 200");
});

Deno.test("RPC failure and timeout return 503, including a late response", async () => {
  const failed = httpHandler(createAsaasWebhookPersistence({
    async rpc() {
      return { data: null, error: { message: "synthetic database failure" } };
    },
  }, 20));
  assert((await failed(request(payload()))).status === 503, "RPC failure was not surfaced as 503");

  const delayed = createAsaasWebhookPersistence({
    rpc: () => new Promise((resolve) => setTimeout(() => resolve({ data: rpcResult(), error: null }), 25)),
  }, 5);
  const timedOut = httpHandler(delayed);
  assert((await timedOut(request(payload()))).status === 503, "timeout was not surfaced as 503");
  await new Promise((resolve) => setTimeout(resolve, 30));
});
