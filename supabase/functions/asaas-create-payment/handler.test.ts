import { PixOrchestrationError } from "../asaas-orchestrator/index.ts";
import { handleCreatePaymentRequest } from "./handler.ts";

function assert(condition: unknown, message = "assertion failed"): asserts condition {
  if (!condition) throw new Error(message);
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

const responseBody = {
  paymentIntent: { status: "created" },
  customer: { status: "active" },
  payment: { status: "created" },
  qrCode: { payload: "pix" },
};

const reusedResponseBody = {
  paymentIntent: { status: "qr_ready" },
  customer: { id: "customer-1", ambiente: "sandbox", status: "active" },
  payment: {
    status: "qr_ready",
    asaasPaymentId: "pay-reused-1",
    amountDueReal: 42.5,
    externalReference: "gemn-order-order-1",
  },
  qrCode: {
    encodedImage: "data:image/png;base64,encoded",
    payload: "000201pix-reused",
    expiresAt: "2026-10-22T12:00:00.000Z",
  },
};

Deno.test("answers OPTIONS with DEV CORS and does not create payment", async () => {
  let calls = 0;
  const response = await handleCreatePaymentRequest(
    new Request("http://localhost/functions/v1/asaas-create-payment", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:8081" },
    }),
    { create: async () => { calls++; return responseBody; } },
  );
  assert(response.status === 204);
  assert(response.headers.get("access-control-allow-origin") === "http://localhost:8081");
  assert(calls === 0);
});

Deno.test("requires bearer authentication and validates the request body", async () => {
  const missingToken = await handleCreatePaymentRequest(
    new Request("http://localhost/functions/v1/asaas-create-payment", {
      method: "POST",
      body: JSON.stringify({ orderId: "order", idempotencyKey: "key" }),
    }),
    { create: async () => responseBody },
  );
  assert(missingToken.status === 401);

  const invalidBody = await handleCreatePaymentRequest(
    new Request("http://localhost/functions/v1/asaas-create-payment", {
      method: "POST",
      headers: { authorization: "Bearer user-token", "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order" }),
    }),
    { create: async () => responseBody },
  );
  assert(invalidBody.status === 400);
});

Deno.test("maps orchestration errors without exposing details", async () => {
  const response = await handleCreatePaymentRequest(
    new Request("http://localhost/functions/v1/asaas-create-payment", {
      method: "POST",
      headers: { authorization: "Bearer user-token", "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order", idempotencyKey: "key" }),
    }),
    {
      create: async () => {
        throw new PixOrchestrationError("PAYMENT_NEEDS_RECONCILIATION", "sensitive detail");
      },
    },
  );
  assert(response.status === 409);
  const body = await json(response);
  assert(body.error === "PAYMENT_NEEDS_RECONCILIATION");
  assert(!JSON.stringify(body).includes("sensitive detail"));
});

Deno.test("returns the complete reused payment response", async () => {
  const response = await handleCreatePaymentRequest(
    new Request("http://localhost/functions/v1/asaas-create-payment", {
      method: "POST",
      headers: { authorization: "Bearer user-token", "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", idempotencyKey: "retry-key-1" }),
    }),
    { create: async () => reusedResponseBody },
  );

  assert(response.status === 200);
  const body = await json(response);
  assert(body.ok === true);
  assert(JSON.stringify(body).includes('"status":"qr_ready"'));
  assert(JSON.stringify(body).includes('"asaasPaymentId":"pay-reused-1"'));
  assert(JSON.stringify(body).includes('"amountDueReal":42.5'));
  assert(JSON.stringify(body).includes('"externalReference":"gemn-order-order-1"'));
  assert(JSON.stringify(body).includes('"payload":"000201pix-reused"'));
});
