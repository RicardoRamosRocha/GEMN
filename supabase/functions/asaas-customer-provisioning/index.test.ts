import {
  type BillingIdentityCryptoEnv,
  encryptBillingDocument,
} from "../billing-identity-crypto/index.ts";
import { AsaasClientError, type AsaasCustomer } from "../asaas-client/index.ts";
import {
  AsaasCustomerProvisioningError,
  createAsaasCustomerProvisioner,
  type CustomerProvisioningClaim,
  type CustomerProvisioningDatabase,
  type StoredBillingIdentity,
} from "./index.ts";

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

async function assertRejects(
  operation: () => Promise<unknown>,
  code: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof AsaasCustomerProvisioningError,
      "expected provisioning error",
    );
    assertEquals(error.code, code);
    return;
  }
  throw new Error("expected operation to reject");
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

const cryptoEnv: BillingIdentityCryptoEnv = {
  get(name) {
    if (name === "GEMN_BILLING_ACTIVE_KEY_VERSION") return "1";
    if (name === "GEMN_BILLING_ENCRYPTION_KEY_V1") {
      return base64Url(new Uint8Array(32).fill(0x11));
    }
    if (name === "GEMN_BILLING_HMAC_KEY_V1") {
      return base64Url(new Uint8Array(32).fill(0x22));
    }
    return undefined;
  },
};

const userId = "e6000000-0000-0000-0000-000000000001";

async function identity(): Promise<StoredBillingIdentity> {
  const encrypted = await encryptBillingDocument(
    userId,
    "52998224725",
    cryptoEnv,
  );
  return {
    id: "identity-1",
    userId,
    documentType: encrypted.documentType,
    documentCiphertext: encrypted.ciphertext,
    keyVersion: encrypted.keyVersion,
    status: "active",
  };
}

function claim(
  overrides: Partial<CustomerProvisioningClaim> = {},
): CustomerProvisioningClaim {
  return {
    provisioningId: "provisioning-1",
    status: "creating",
    claimGranted: true,
    claimToken: "claim-1",
    asaasCustomerRecordId: null,
    providerCustomerId: null,
    ...overrides,
  };
}

function database(
  stored: StoredBillingIdentity,
  selectedClaim: CustomerProvisioningClaim,
  events: string[],
  finalizeError = false,
  profileError = false,
  releaseError = false,
): CustomerProvisioningDatabase {
  return {
    async getBuyerProfile() {
      if (profileError) throw new Error("profile lookup failed");
      return { name: "Sandbox Buyer", email: "buyer@example.test" };
    },
    async getActiveBillingIdentity(inputUserId) {
      events.push(`identity:${inputUserId}`);
      return stored;
    },
    async claimCustomerProvisioning(input) {
      events.push(`claim:${input.billingIdentityId}:${input.ambiente}`);
      return selectedClaim;
    },
    async finalizeCustomerProvisioning(input) {
      events.push(`finalize:${input.providerCustomerId}`);
      if (finalizeError) throw new Error("database unavailable");
      return {
        provisioningId: input.provisioningId,
        status: "ready",
        asaasCustomerRecordId: "local-customer-1",
        providerCustomerId: input.providerCustomerId,
      };
    },
    async markCustomerProvisioningNeedsReview(input) {
      events.push(`needs-review:${input.provisioningId}`);
    },
    async releaseCustomerProvisioningClaim(input) {
      events.push(`release:${input.provisioningId}`);
      if (releaseError) throw new Error("release failed");
    },
  };
}

function customer(id: string): AsaasCustomer {
  return { id, name: "Sandbox Customer" };
}

Deno.test("creates a Sandbox customer using decrypted identity only inside the backend", async () => {
  const events: string[] = [];
  const stored = await identity();
  const result = await createAsaasCustomerProvisioner({
    db: database(stored, claim(), events),
    cryptoEnv,
    asaas: {
      async findCustomer(input) {
        events.push(`find:${input.cpfCnpj}`);
        return null;
      },
      async createCustomer(input) {
        events.push(`create:${input.cpfCnpj}`);
        return customer("cus-created");
      },
    },
  }).provision(userId);
  assertEquals(result.outcome, "created");
  assertEquals(result.providerCustomerId, "cus-created");
  assert(events.includes("find:52998224725"));
  assert(events.includes("create:52998224725"));
  assert(events.includes("finalize:cus-created"));
});

Deno.test("reuses an existing provider customer and never creates another one", async () => {
  const events: string[] = [];
  const stored = await identity();
  const result = await createAsaasCustomerProvisioner({
    db: database(stored, claim({ claimGranted: true }), events),
    cryptoEnv,
    asaas: {
      async findCustomer() {
        events.push("find");
        return customer("cus-existing");
      },
      async createCustomer() {
        throw new Error("must not create");
      },
    },
  }).provision(userId);
  assertEquals(result.providerCustomerId, "cus-existing");
  assert(!events.includes("create"));
});

Deno.test("reuses a ready local provisioning without decrypting or calling Asaas", async () => {
  const events: string[] = [];
  const stored = await identity();
  const result = await createAsaasCustomerProvisioner({
    db: database(
      stored,
      claim({
        claimGranted: false,
        status: "ready",
        claimToken: null,
        asaasCustomerRecordId: "local-customer-1",
        providerCustomerId: "cus-ready",
      }),
      events,
    ),
    cryptoEnv: {
      get: () => {
        throw new Error("crypto must not be read");
      },
    },
    asaas: {
      async findCustomer() {
        throw new Error("Asaas must not be called");
      },
      async createCustomer() {
        throw new Error("Asaas must not be called");
      },
    },
  }).provision(userId);
  assertEquals(result.outcome, "reused");
  assertEquals(result.providerCustomerId, "cus-ready");
});

Deno.test("maps an active concurrent claim to in-progress without calling Asaas", async () => {
  const events: string[] = [];
  const stored = await identity();
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(
        stored,
        claim({ claimGranted: false, claimToken: null }),
        events,
      ),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          throw new Error("Asaas must not be called");
        },
        async createCustomer() {
          throw new Error("Asaas must not be called");
        },
      },
    }).provision(userId), "PROVISIONING_IN_PROGRESS");
});

Deno.test("keeps profile and decryption failures recoverable before any Asaas call", async () => {
  const profileEvents: string[] = [];
  const stored = await identity();
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), profileEvents, false, true),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          throw new Error("Asaas must not be called");
        },
        async createCustomer() {
          throw new Error("Asaas must not be called");
        },
      },
    }).provision(userId), "INTERNAL_ERROR");
  assert(!profileEvents.some((event) => event.startsWith("needs-review:")));
  assert(profileEvents.includes("release:provisioning-1"));

  const decryptEvents: string[] = [];
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), decryptEvents),
      cryptoEnv: { get: () => undefined },
      asaas: {
        async findCustomer() {
          throw new Error("Asaas must not be called");
        },
        async createCustomer() {
          throw new Error("Asaas must not be called");
        },
      },
    }).provision(userId), "INTERNAL_ERROR");
  assert(!decryptEvents.some((event) => event.startsWith("needs-review:")));
  assert(decryptEvents.includes("release:provisioning-1"));
});

Deno.test("does not mark a failed Asaas lookup as a possible creation", async () => {
  const stored = await identity();
  const lookupEvents: string[] = [];
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), lookupEvents),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          throw new AsaasClientError("TIMEOUT", "timeout", { uncertain: true });
        },
        async createCustomer() {
          throw new Error("must not create after lookup timeout");
        },
      },
    }).provision(userId), "ASAAS_TIMEOUT");
  assert(!lookupEvents.includes("needs-review:provisioning-1"));
  assert(lookupEvents.includes("release:provisioning-1"));

  const createEvents: string[] = [];
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), createEvents),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          return null;
        },
        async createCustomer() {
          throw new AsaasClientError("TIMEOUT", "timeout", { uncertain: true });
        },
      },
    }).provision(userId), "PROVISIONING_NEEDS_REVIEW");
  assert(createEvents.includes("needs-review:provisioning-1"));
});

Deno.test("keeps a known provider rejection distinct without marking ambiguity", async () => {
  const events: string[] = [];
  const stored = await identity();
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), events),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          return null;
        },
        async createCustomer() {
          throw new AsaasClientError("HTTP_ERROR", "rejected", { status: 400 });
        },
      },
    }).provision(userId), "ASAAS_REJECTED");
  assert(!events.includes("needs-review:provisioning-1"));
});

Deno.test("moves an ambiguous finalization result to review without retrying the provider", async () => {
  const events: string[] = [];
  const stored = await identity();
  await assertRejects(() =>
    createAsaasCustomerProvisioner({
      db: database(stored, claim(), events, true),
      cryptoEnv,
      asaas: {
        async findCustomer() {
          return customer("cus-finalization");
        },
        async createCustomer() {
          throw new Error("must not create");
        },
      },
    }).provision(userId), "PROVISIONING_NEEDS_REVIEW");
  assert(events.includes("finalize:cus-finalization"));
  assert(events.includes("needs-review:provisioning-1"));
});
