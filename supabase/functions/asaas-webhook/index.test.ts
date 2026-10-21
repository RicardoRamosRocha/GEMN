import {
  createAsaasWebhookPersistence,
  validatePersistenceResult,
  WebhookPersistenceError,
  type SupabaseRpcPort,
} from "./index.ts";

const result = {
  webhook_event_id: "00000000-0000-4000-8000-000000000001",
  duplicate: false,
  hash_conflict: false,
  persisted: true,
  processing_status: "needs_review",
  reason_code: "PAYMENT_INTENT_NOT_FOUND",
  payment_intent_id: null,
};

const input = {
  p_asaas_event_id: "evt_test",
  p_event_type: "PAYMENT_RECEIVED",
  p_asaas_payment_id: "pay_test",
  p_external_reference: null,
  p_provider_status: "RECEIVED",
  p_payment_value: 25,
  p_net_value: 24.5,
  p_occurred_at: null,
  p_payload_hash: "a".repeat(64),
  p_source_date_created: "2026-10-21 12:34:56",
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function port(response: { data: unknown; error: { message: string } | null }): SupabaseRpcPort {
  return { rpc: async () => response };
}

Deno.test("calls the v2 RPC with exactly ten parameters", async () => {
  let name = "";
  let args: Record<string, unknown> = {};
  const persistence = createAsaasWebhookPersistence({
    rpc: async (rpcName, rpcArgs) => {
      name = rpcName;
      args = rpcArgs;
      return { data: [result], error: null };
    },
  });
  const persisted = await persistence(input);
  assertEquals(name, "ingest_asaas_webhook_event_v2", "RPC name");
  assertEquals(Object.keys(args).length, 10, "parameter count");
  assertEquals(persisted.persisted, true, "persisted");
  assertEquals(args.p_source_date_created, input.p_source_date_created, "source date");
});

Deno.test("accepts persisted duplicate and conflict results", async () => {
  const persisted = await createAsaasWebhookPersistence(port({
    data: [{ ...result, duplicate: true, hash_conflict: true, reason_code: "DUPLICATE_HASH_CONFLICT" }],
    error: null,
  }))(input);
  assert(persisted.duplicate && persisted.hash_conflict && persisted.persisted, "duplicate conflict result");
});

Deno.test("converts Supabase errors into persistence failures", async () => {
  let rejected = false;
  try {
    await createAsaasWebhookPersistence(port({ data: null, error: { message: "database unavailable" } }))(input);
  } catch (error) {
    rejected = error instanceof WebhookPersistenceError;
  }
  assert(rejected, "Supabase error was not rejected");
});

Deno.test("times out a pending RPC", async () => {
  let rejected = false;
  try {
    await createAsaasWebhookPersistence({ rpc: () => new Promise(() => undefined) }, 5)(input);
  } catch (error) {
    rejected = error instanceof WebhookPersistenceError;
  }
  assert(rejected, "RPC timeout was not rejected");
});

Deno.test("rejects empty, multiple, and malformed RPC rows", () => {
  const cases: unknown[] = [[], [result, result], [{ ...result, persisted: "true" }], [{ ...result, webhook_event_id: "not-a-uuid" }]];
  for (const value of cases) {
    let rejected = false;
    try {
      validatePersistenceResult(value);
    } catch (error) {
      rejected = error instanceof WebhookPersistenceError;
    }
    assert(rejected, "unexpected RPC result was accepted");
  }
});

Deno.test("rejects invalid processing status and identifiers", () => {
  for (const value of [{ ...result, processing_status: "unknown" }, { ...result, payment_intent_id: "not-a-uuid" }, { ...result, reason_code: 42 }]) {
    let rejected = false;
    try {
      validatePersistenceResult([value]);
    } catch (error) {
      rejected = error instanceof WebhookPersistenceError;
    }
    assert(rejected, "invalid RPC field was accepted");
  }
});
