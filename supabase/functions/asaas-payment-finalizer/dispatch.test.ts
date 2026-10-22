import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createFinalizationDispatcher, FinalizationDispatchError } from "./dispatch.ts";

const input = {
  paymentIntentId: "11111111-1111-4111-8111-111111111111",
  idempotencyKey: "22222222-2222-4222-8222-222222222222",
};

Deno.test("dispatches only identifiers and retries transient failures", async () => {
  let attempts = 0;
  let body = "";
  const dispatcher = createFinalizationDispatcher({
    url: "http://127.0.0.1:18001",
    internalToken: "synthetic-internal-token",
    sleep: async () => {},
    fetchImpl: async (_input, init) => {
      attempts += 1;
      body = String(init?.body);
      return new Response(null, { status: attempts === 1 ? 503 : 200 });
    },
  });
  await dispatcher.dispatch(input);
  assertEquals(attempts, 2);
  assertEquals(body, JSON.stringify({ payment_intent_id: input.paymentIntentId, idempotency_key: input.idempotencyKey }));
});

Deno.test("does not retry permanent authorization failures and times out safely", async () => {
  let attempts = 0;
  const unauthorized = createFinalizationDispatcher({
    url: "http://127.0.0.1:18001",
    internalToken: "synthetic-internal-token",
    sleep: async () => {},
    fetchImpl: async () => {
      attempts += 1;
      return new Response(null, { status: 401 });
    },
  });
  await assertRejects(() => unauthorized.dispatch(input), FinalizationDispatchError);
  assertEquals(attempts, 1);

  const timeout = createFinalizationDispatcher({
    url: "http://127.0.0.1:18001",
    internalToken: "synthetic-internal-token",
    timeoutMs: 1,
    maxAttempts: 2,
    sleep: async () => {},
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  });
  await assertRejects(() => timeout.dispatch(input), FinalizationDispatchError);
});
