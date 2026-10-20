import {
  type BillingIdentityHandlerDependencies,
  handleRegisterBillingIdentityRequest,
} from "./handler.ts";
import { BillingIdentityRegistrationError } from "../billing-identity-registration/index.ts";
import { BillingIdentityCryptoError } from "../billing-identity-crypto/index.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function deps(overrides: Partial<BillingIdentityHandlerDependencies> = {}) {
  const calls: string[] = [];
  const value: BillingIdentityHandlerDependencies = {
    async authenticate(token) {
      calls.push(`auth:${token}`);
      return { userId: "verified-user" };
    },
    async register(userId, orderId, document) {
      calls.push(`register:${userId}:${orderId}:${document}`);
      return {
        outcome: "created",
        identity: {
          id: "identity-1",
          userId,
          identityVersion: 1,
          documentType: "cpf",
          documentFingerprint: "opaque-not-returned",
          documentLast4: "4725",
          keyVersion: 1,
          status: "active",
        },
      };
    },
    ...overrides,
  };
  return { value, calls };
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function assertCors(response: Response, origin = "http://localhost:8081") {
  assertEquals(response.headers.get("access-control-allow-origin"), origin);
  assertEquals(
    response.headers.get("access-control-allow-methods"),
    "POST, OPTIONS",
  );
  assertEquals(
    response.headers.get("access-control-allow-headers"),
    "authorization, apikey, x-client-info, content-type",
  );
}

Deno.test("answers the authorized preflight with CORS headers", async () => {
  const { value, calls } = deps();
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "OPTIONS",
      headers: { origin: "http://localhost:8081" },
    }),
    value,
  );
  assertEquals(response.status, 204);
  assertCors(response);
  assertEquals(calls, []);
});

Deno.test("requires verified authentication", async () => {
  const { value, calls } = deps({ authenticate: async () => null });
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ orderId: "order-1", document: "52998224725" }),
    }),
    value,
  );
  assertEquals(response.status, 401);
  assertEquals(calls, []);
});

Deno.test("rejects userId, ciphertext, fingerprint and malformed input", async () => {
  const { value, calls } = deps();
  for (
    const input of [
      { userId: "other", orderId: "order-1", document: "52998224725" },
      { orderId: "order-1", document: "52998224725", ciphertext: "arbitrary" },
      { orderId: "order-1", document: "52998224725", fingerprint: "arbitrary" },
    ]
  ) {
    const response = await handleRegisterBillingIdentityRequest(
      new Request("http://edge.test/", {
        method: "POST",
        headers: {
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      }),
      value,
    );
    assertEquals(response.status, 400);
  }
  assertEquals(calls, []);
});

Deno.test("passes only the verified user and document to the backend service", async () => {
  const { value, calls } = deps();
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: {
        origin: "http://localhost:8081",
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId: "order-1", document: "52998224725" }),
    }),
    value,
  );
  assertEquals(response.status, 200);
  assertCors(response);
  assertEquals(await body(response), {
    ok: true,
    outcome: "created",
    identityId: "identity-1",
    identityVersion: 1,
    documentType: "cpf",
    documentLast4: "4725",
    keyVersion: 1,
    status: "active",
  });
  assertEquals(calls, [
    "auth:token",
    "register:verified-user:order-1:52998224725",
  ]);
});

Deno.test("maps idempotent reuse and conflict without document details", async () => {
  for (const [code, status] of [["IDENTITY_CONFLICT", 409]] as const) {
    const { value } = deps({
      async register() {
        throw new BillingIdentityRegistrationError(code, "safe conflict");
      },
    });
    const response = await handleRegisterBillingIdentityRequest(
      new Request("http://edge.test/", {
        method: "POST",
        headers: {
          origin: "http://localhost:8081",
          authorization: "Bearer token",
          "content-type": "application/json",
        },
        body: JSON.stringify({ orderId: "order-1", document: "52998224725" }),
      }),
      value,
    );
    assertEquals(response.status, status);
    assertCors(response);
    assertEquals(await body(response), { ok: false, error: code });
  }
});

Deno.test("maps invalid documents to a sanitized 400 response", async () => {
  const { value } = deps({
    async register() {
      throw new BillingIdentityCryptoError(
        "INVALID_DOCUMENT",
        "document details must not escape",
      );
    },
  });
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: {
        origin: "http://localhost:8081",
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId: "order-1", document: "invalid" }),
    }),
    value,
  );
  assertEquals(response.status, 400);
  assertCors(response);
  assertEquals(await body(response), { ok: false, error: "INVALID_DOCUMENT" });
});

Deno.test("maps cryptographic configuration failures to a sanitized 500 response", async () => {
  const { value } = deps({
    async register() {
      throw new BillingIdentityCryptoError(
        "INVALID_KEY",
        "key details must not escape",
      );
    },
  });
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: {
        origin: "http://localhost:8081",
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId: "order-1", document: "valid-test-document" }),
    }),
    value,
  );
  assertEquals(response.status, 500);
  assertCors(response);
  assertEquals(await body(response), { ok: false, error: "INTERNAL_ERROR" });
});

Deno.test("keeps CORS headers on unexpected failures", async () => {
  const { value } = deps({
    async register() {
      throw new Error("internal details must not escape");
    },
  });
  const response = await handleRegisterBillingIdentityRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: {
        origin: "http://localhost:8081",
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ orderId: "order-1", document: "valid-test-document" }),
    }),
    value,
  );
  assertEquals(response.status, 500);
  assertCors(response);
  assertEquals(await body(response), { ok: false, error: "INTERNAL_ERROR" });
});
