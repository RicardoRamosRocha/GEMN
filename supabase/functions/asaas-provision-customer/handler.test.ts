import {
  handleProvisionCustomerRequest,
  type ProvisionCustomerHandlerDependencies,
} from "./handler.ts";
import { AsaasCustomerProvisioningError } from "../asaas-customer-provisioning/index.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return await response.json() as Record<string, unknown>;
}

function dependencies(
  overrides: Partial<ProvisionCustomerHandlerDependencies> = {},
) {
  const calls: string[] = [];
  const deps: ProvisionCustomerHandlerDependencies = {
    async authenticate(token) {
      calls.push(`auth:${token}`);
      return { userId: "verified-user" };
    },
    async provision(userId) {
      calls.push(`provision:${userId}`);
      return {
        outcome: "created",
        billingIdentityId: "identity-1",
        provisioningId: "provisioning-1",
        localCustomerId: "customer-1",
        providerCustomerId: "cus_sandbox_1",
        ambiente: "sandbox",
      };
    },
    ...overrides,
  };
  return { deps, calls };
}

Deno.test("rejects missing or invalid authentication without provisioning", async () => {
  const { deps, calls } = dependencies({
    authenticate: async () => null,
  });
  const response = await handleProvisionCustomerRequest(
    new Request("http://edge.test/", { method: "POST" }),
    deps,
  );
  assertEquals(response.status, 401);
  assertEquals(await responseBody(response), {
    ok: false,
    error: "UNAUTHORIZED",
  });
  assertEquals(calls, []);
});

Deno.test("never accepts a client-selected userId", async () => {
  const { deps, calls } = dependencies();
  const response = await handleProvisionCustomerRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: {
        authorization: "Bearer token",
        "content-type": "application/json",
      },
      body: JSON.stringify({ userId: "other-user" }),
    }),
    deps,
  );
  assertEquals(response.status, 400);
  assertEquals(calls, []);
});

Deno.test("provisions only the verified user and does not return identity data", async () => {
  const { deps, calls } = dependencies();
  const response = await handleProvisionCustomerRequest(
    new Request("http://edge.test/", {
      method: "POST",
      headers: { authorization: "Bearer token" },
    }),
    deps,
  );
  assertEquals(response.status, 200);
  assertEquals(await responseBody(response), {
    ok: true,
    outcome: "created",
    billingIdentityId: "identity-1",
    provisioningId: "provisioning-1",
    localCustomerId: "customer-1",
    providerCustomerId: "cus_sandbox_1",
    ambiente: "sandbox",
  });
  assertEquals(calls, ["auth:token", "provision:verified-user"]);
});

Deno.test("maps idempotency and ambiguous external outcomes without retrying", async () => {
  for (
    const [code, status] of [["PROVISIONING_IN_PROGRESS", 409], [
      "PROVISIONING_NEEDS_REVIEW",
      409,
    ], ["ASAAS_TIMEOUT", 409]] as const
  ) {
    const { deps } = dependencies({
      async provision() {
        throw new AsaasCustomerProvisioningError(code, "generic safe message");
      },
    });
    const response = await handleProvisionCustomerRequest(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
      deps,
    );
    assertEquals(response.status, status);
    assertEquals(await responseBody(response), { ok: false, error: code });
  }
});

Deno.test("returns safe errors for rejected, unavailable and unexpected failures", async () => {
  for (
    const [code, status] of [["ASAAS_REJECTED", 502], [
      "ASAAS_UNAVAILABLE",
      503,
    ], ["INTERNAL_ERROR", 500]] as const
  ) {
    const { deps } = dependencies({
      async provision() {
        throw new AsaasCustomerProvisioningError(code, "must not be exposed");
      },
    });
    const response = await handleProvisionCustomerRequest(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { authorization: "Bearer token" },
      }),
      deps,
    );
    assertEquals(response.status, status);
    assertEquals(await responseBody(response), { ok: false, error: code });
  }
});

Deno.test("validates method and JSON shape", async () => {
  const { deps } = dependencies();
  assertEquals(
    (await handleProvisionCustomerRequest(
      new Request("http://edge.test/"),
      deps,
    )).status,
    405,
  );
  assertEquals(
    (await handleProvisionCustomerRequest(
      new Request("http://edge.test/", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
      deps,
    )).status,
    400,
  );
  assertEquals(
    (await handleProvisionCustomerRequest(
      new Request("http://edge.test/", { method: "OPTIONS" }),
      deps,
    )).status,
    204,
  );
});
