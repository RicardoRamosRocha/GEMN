import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  AsaasPaymentFinalizerError,
  createAsaasPaymentVerifier,
  createFinalizerHandler,
  mapVerifiedPayment,
} from "./index.ts";

Deno.test("rejects pending, non-BRL and non-Pix provider responses", async () => {
  await assertRejects(
    async () => { mapVerifiedPayment({ id: "pay", status: "PENDING", value: 10, currency: "BRL", externalReference: "ref", customer: "cus", billingType: "PIX" }); },
    AsaasPaymentFinalizerError,
  );
  await assertRejects(
    async () => { mapVerifiedPayment({ id: "pay", status: "RECEIVED", value: 10, currency: "USD", externalReference: "ref", customer: "cus", billingType: "PIX" }); },
    AsaasPaymentFinalizerError,
  );
});

Deno.test("verifies the provider before calling the financial RPC", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const handler = createFinalizerHandler({
    internalToken: "internal-test-token",
    getStoredIntent: async () => ({ asaasPaymentId: "pay-1", providerCustomerId: "cus-1" }),
    verifier: { verify: async () => ({ id: "pay-1", status: "CONFIRMED", value: 42.5, currency: "BRL", externalReference: "gemn-order-1", customer: "cus-1", billingType: "PIX" }) },
    rpc: { rpc: async (name, args) => { calls.push({ name, args }); return { data: [{ status: "confirmado" }], error: null }; } },
  });
  const response = await handler(new Request("http://localhost", {
    method: "POST",
    headers: { "x-gemn-internal-token": "internal-test-token", "content-type": "application/json" },
    body: JSON.stringify({ payment_intent_id: "11111111-1111-4111-8111-111111111111", idempotency_key: "22222222-2222-4222-8222-222222222222" }),
  }));
  assertEquals(response.status, 200);
  assertEquals(calls[0].name, "finalize_asaas_payment");
  assertEquals(calls[0].args.p_amount_due_real, 42.5);
});

Deno.test("uses the Asaas verification endpoint and never trusts request amount", async () => {
  let request: Request | undefined;
  const verifier = createAsaasPaymentVerifier({
    apiKey: "synthetic-key",
    baseUrl: "https://api-sandbox.asaas.com/v3",
    fetchImpl: async (input, init) => {
      request = new Request(input, init);
      return Response.json({ id: "pay-1", status: "RECEIVED", value: 10, currency: "BRL", externalReference: "ref", customer: "cus", billingType: "PIX" });
    },
  });
  await verifier.verify("pay-1");
  assertEquals(request?.url, "https://api-sandbox.asaas.com/v3/payments/pay-1");
  assertEquals(request?.headers.get("access_token"), "synthetic-key");
});

Deno.test("rejects non-Sandbox endpoints and aborts slow provider requests", async () => {
  await assertRejects(
    async () => createAsaasPaymentVerifier({ apiKey: "synthetic-key", baseUrl: "https://api.asaas.com/v3" }),
    AsaasPaymentFinalizerError,
  );
  const verifier = createAsaasPaymentVerifier({
    apiKey: "synthetic-key",
    baseUrl: "https://api-sandbox.asaas.com/v3",
    timeoutMs: 1,
    fetchImpl: (_input, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  });
  await assertRejects(() => verifier.verify("pay-1"), AsaasPaymentFinalizerError);
});
