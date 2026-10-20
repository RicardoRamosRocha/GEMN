import {
  createSupabaseCustomerProvisioningAdapter,
  type CustomerProvisioningQueryPort,
  type CustomerProvisioningTablePort,
  SupabaseCustomerProvisioningAdapterError,
  type SupabaseCustomerProvisioningAdminPort,
} from "./index.ts";
import type { SupabaseInsertPort } from "../asaas-supabase-adapter/index.ts";

function assert(
  condition: unknown,
  message = "assertion failed",
): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

function result(data: unknown, error: unknown = null) {
  return { data, error };
}

function tableMock(
  response: { data: unknown; error: unknown },
  calls: unknown[],
): CustomerProvisioningTablePort {
  const query: CustomerProvisioningQueryPort & SupabaseInsertPort = {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
    eq(column, value) {
      calls.push(["eq", column, value]);
      return query;
    },
    async maybeSingle() {
      calls.push(["maybeSingle"]);
      return response;
    },
    async single() {
      calls.push(["single"]);
      return response;
    },
    order(column, options) {
      calls.push(["order", column, options]);
      return query;
    },
    limit(count) {
      calls.push(["limit", count]);
      return query;
    },
  };
  return {
    select(columns) {
      calls.push(["select", columns]);
      return query;
    },
  };
}

function adminMock(
  rpcRows: Record<string, unknown>[],
  tableResponse: { data: unknown; error: unknown },
  calls: unknown[],
  profileResponse: { data: unknown; error: unknown } = tableResponse,
  authUser: { email?: string | null; user_metadata?: Record<string, unknown> } = {
    email: "buyer@example.test",
  },
): SupabaseCustomerProvisioningAdminPort {
  let index = 0;
  return {
    async rpc(name, args) {
      calls.push(["rpc", name, args]);
      return result([rpcRows[index++]]);
    },
    from(table) {
      calls.push(["from", table]);
      return tableMock(
        table === "profiles" ? profileResponse : tableResponse,
        calls,
      );
    },
    auth: {
      admin: {
        async getUserById(userId) {
          calls.push(["auth.getUserById", userId]);
          return {
            data: { user: authUser },
            error: null,
          };
        },
      },
    },
  };
}

Deno.test("reads only active identity fields and maps backend RPC contracts", async () => {
  const calls: unknown[] = [];
  const adapter = createSupabaseCustomerProvisioningAdapter({
    adminClient: adminMock(
      [
        {
          provisioning_id: "p1",
          status: "creating",
          claim_granted: true,
          claim_token: "t1",
          asaas_customer_record_id: null,
          provider_customer_id: null,
        },
        {
          provisioning_id: "p1",
          status: "ready",
          claim_granted: false,
          claim_token: null,
          asaas_customer_record_id: "local1",
          provider_customer_id: "cus1",
        },
        { provisioning_id: "p1", status: "needs_review" },
        { provisioning_id: "p1", status: "pending", changed: true },
      ],
      {
        data: {
          id: "i1",
          user_id: "u1",
          document_type: "cpf",
          document_ciphertext: "gbi1.1.cpf.nonce.payload",
          key_version: 1,
          status: "active",
        },
        error: null,
      },
      calls,
      {
        data: { id: "u1", nome_completo: "Sandbox Buyer" },
        error: null,
      },
    ),
  });
  assertEquals(await adapter.getBuyerProfile("u1"), {
    name: "Sandbox Buyer",
    email: "buyer@example.test",
  });
  assertEquals(await adapter.getActiveBillingIdentity("u1"), {
    id: "i1",
    userId: "u1",
    documentType: "cpf",
    documentCiphertext: "gbi1.1.cpf.nonce.payload",
    keyVersion: 1,
    status: "active",
  });
  assertEquals(
    (await adapter.claimCustomerProvisioning({
      billingIdentityId: "i1",
      ambiente: "sandbox",
    })).claimGranted,
    true,
  );
  assertEquals(
    (await adapter.finalizeCustomerProvisioning({
      provisioningId: "p1",
      claimToken: "t1",
      providerCustomerId: "cus1",
    })).status,
    "ready",
  );
  await adapter.markCustomerProvisioningNeedsReview({
    provisioningId: "p1",
    claimToken: "t1",
  });
  await adapter.releaseCustomerProvisioningClaim({
    provisioningId: "p1",
    claimToken: "t1",
  });
  assert(
    calls.some((entry) =>
      JSON.stringify(entry).includes("document_ciphertext")
    ),
  );
  assert(
    calls.some((entry) => JSON.stringify(entry).includes("cpfCnpj")) === false,
    "plaintext document crossed the Supabase adapter",
  );
  assert(
    calls.some((entry) =>
      JSON.stringify(entry).includes("claim_asaas_customer_provisioning")
    ),
  );
});

Deno.test("uses a safe Auth fallback when profile name is nullable", async () => {
  const calls: unknown[] = [];
  const adapter = createSupabaseCustomerProvisioningAdapter({
    adminClient: adminMock([], {
      data: { id: "u1", nome_completo: null },
      error: null,
    }, calls, {
      data: { id: "u1", nome_completo: null },
      error: null,
    }, {
      email: "buyer@example.test",
      user_metadata: { nome_completo: "Auth Buyer" },
    }),
  });
  assertEquals(await adapter.getBuyerProfile("u1"), {
    name: "Auth Buyer",
    email: "buyer@example.test",
  });
});

Deno.test("rejects malformed identity responses without exposing values", async () => {
  const calls: unknown[] = [];
  const adapter = createSupabaseCustomerProvisioningAdapter({
    adminClient: adminMock([], {
      data: { id: "i1", status: "active", document_type: "cpf" },
      error: null,
    }, calls),
  });
  try {
    await adapter.getActiveBillingIdentity("u1");
  } catch (error) {
    assert(error instanceof SupabaseCustomerProvisioningAdapterError);
    assert(!error.message.includes("i1"));
    return;
  }
  throw new Error("expected malformed identity to fail");
});
