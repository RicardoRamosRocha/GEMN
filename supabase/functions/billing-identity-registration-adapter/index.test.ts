import {
  BillingIdentityRegistrationAdapterError,
  type BillingIdentityRegistrationAdminPort,
  type BillingIdentityRegistrationTablePort,
  createBillingIdentityRegistrationAdapter,
} from "./index.ts";
import type { SupabaseQueryPort } from "../asaas-supabase-adapter/index.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function result(data: unknown, error: unknown = null) {
  return { data, error };
}

function adminMock(options: {
  active: unknown;
  latest: unknown;
  inserted: unknown;
  insertError?: unknown;
  calls: unknown[];
}): BillingIdentityRegistrationAdminPort {
  return {
    async rpc() {
      return result([]);
    },
    from(table): BillingIdentityRegistrationTablePort {
      let mode = table === "billing_identities" ? "active" : "unknown";
      const query: SupabaseQueryPort = {
        eq(column: string, value: string) {
          options.calls.push(["eq", column, value]);
          return query;
        },
        order(column: string, orderOptions: { ascending: boolean }) {
          options.calls.push(["order", column, orderOptions]);
          return query;
        },
        limit(count: number) {
          options.calls.push(["limit", count]);
          return query;
        },
        async maybeSingle() {
          options.calls.push(["maybeSingle"]);
          if (mode === "order") {
            return result({
              id: "order-1",
              buyer_id: "user-1",
              valor_devido_real: 10,
            });
          }
          return mode === "latest"
            ? result(options.latest)
            : result(options.active);
        },
        async single() {
          return result(options.active);
        },
      };
      return {
        select(columns: string) {
          options.calls.push(["select", columns]);
          if (columns === "identity_version") mode = "latest";
          if (columns.startsWith("id,")) {
            mode = table === "orders" ? "order" : "active";
          }
          return query;
        },
        async insert(values: Record<string, unknown>) {
          options.calls.push(["insert", values]);
          mode = "insert";
          return options.insertError
            ? result(null, options.insertError)
            : result(options.inserted);
        },
      };
    },
  };
}

const active = {
  id: "identity-1",
  user_id: "user-1",
  identity_version: 2,
  document_type: "cpf",
  document_fingerprint: "gbi1.1.fp",
  document_last4: "4725",
  key_version: 1,
  status: "active",
};

Deno.test("reads opaque active identity and next version without ciphertext", async () => {
  const calls: unknown[] = [];
  const adapter = createBillingIdentityRegistrationAdapter({
    adminClient: adminMock({
      active,
      latest: { identity_version: 2 },
      inserted: active,
      calls,
    }),
  });
  const identity = await adapter.getActiveBillingIdentity("user-1");
  assert(identity?.documentFingerprint === "gbi1.1.fp", "fingerprint missing");
  assert(
    !calls.some((call) => JSON.stringify(call).includes("document_ciphertext")),
    "ciphertext selected",
  );
  assert(
    await adapter.getLatestIdentityVersion("user-1") === 2,
    "version mismatch",
  );
});

Deno.test("writes only the protected identity fields and maps database failure", async () => {
  const calls: unknown[] = [];
  const adapter = createBillingIdentityRegistrationAdapter({
    adminClient: adminMock({
      active,
      latest: null,
      inserted: active,
      calls,
    }),
  });
  await adapter.insertBillingIdentity({
    userId: "user-1",
    identityVersion: 1,
    documentType: "cpf",
    documentCiphertext: "gbi1.1.cpf.nonce.ciphertext",
    documentFingerprint: "gbi1.1.fp",
    documentLast4: "4725",
    keyVersion: 1,
  });
  assert(
    calls.some((call) => JSON.stringify(call).includes("document_ciphertext")),
    "ciphertext was not persisted",
  );
  assert(
    !calls.some((call) => JSON.stringify(call).includes("52998224725")),
    "plaintext crossed adapter",
  );

  const failing = createBillingIdentityRegistrationAdapter({
    adminClient: adminMock({
      active: null,
      latest: null,
      inserted: null,
      insertError: new Error("unique"),
      calls: [],
    }),
  });
  try {
    await failing.insertBillingIdentity({
      userId: "user-1",
      identityVersion: 1,
      documentType: "cpf",
      documentCiphertext: "gbi1.1.cpf.nonce.ciphertext",
      documentFingerprint: "gbi1.1.fp",
      documentLast4: "4725",
      keyVersion: 1,
    });
  } catch (error) {
    assert(
      error instanceof BillingIdentityRegistrationAdapterError,
      "wrong adapter error",
    );
    return;
  }
  throw new Error("expected insert failure");
});
