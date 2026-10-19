import {
  type BillingIdentityRegistrationDatabase,
  BillingIdentityRegistrationError,
  createBillingIdentityRegistrar,
  type StoredBillingIdentityRegistration,
} from "./index.ts";
import {
  type BillingIdentityCryptoEnv,
  encryptBillingDocument,
  fingerprintBillingDocument,
} from "../billing-identity-crypto/index.ts";

function assertEquals<T>(actual: T, expected: T): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(
      `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

const userId = "11111111-1111-4111-8111-111111111111";
function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(
    /=+$/g,
    "",
  );
}

const env: BillingIdentityCryptoEnv = {
  get(name: string) {
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

async function stored(
  document: string,
): Promise<StoredBillingIdentityRegistration> {
  const encrypted = await encryptBillingDocument(userId, document, env);
  const fingerprint = await fingerprintBillingDocument(document, env);
  return {
    id: "identity-1",
    userId,
    identityVersion: 1,
    documentType: encrypted.documentType,
    documentFingerprint: fingerprint.fingerprint,
    documentLast4: encrypted.documentLast4,
    keyVersion: 1,
    status: "active",
  };
}

function database(
  overrides: Partial<BillingIdentityRegistrationDatabase> = {},
) {
  let active: StoredBillingIdentityRegistration | null = null;
  const inserted: Record<string, unknown>[] = [];
  const db: BillingIdentityRegistrationDatabase = {
    async hasPositiveRealAmountDue() {
      return true;
    },
    async getActiveBillingIdentity() {
      return active;
    },
    async getLatestIdentityVersion() {
      return 0;
    },
    async insertBillingIdentity(input) {
      inserted.push(input);
      active = {
        id: "identity-1",
        userId: input.userId,
        identityVersion: input.identityVersion,
        documentType: input.documentType,
        documentFingerprint: input.documentFingerprint,
        documentLast4: input.documentLast4,
        keyVersion: input.keyVersion,
        status: "active",
      };
      return active;
    },
    ...overrides,
  };
  return {
    db,
    inserted,
    setActive(value: StoredBillingIdentityRegistration | null) {
      active = value;
    },
  };
}

Deno.test("validates, encrypts and persists only opaque identity fields", async () => {
  const fixture = database();
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  const result = await registrar.register(userId, "order-1", "529.982.247-25");
  assertEquals(result.outcome, "created");
  const input = fixture.inserted[0];
  if (!input || typeof input.documentCiphertext !== "string") {
    throw new Error("ciphertext missing");
  }
  if (JSON.stringify(input).includes("52998224725")) {
    throw new Error("plaintext persisted");
  }
  assertEquals(input.documentType, "cpf");
  assertEquals(input.documentLast4, "4725");
});

Deno.test("reuses the same active identity without inserting again", async () => {
  const existing = await stored("529.982.247-25");
  const fixture = database({
    async getActiveBillingIdentity() {
      return existing;
    },
  });
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  const result = await registrar.register(userId, "order-1", "529.982.247-25");
  assertEquals(result.outcome, "reused");
  assertEquals(fixture.inserted.length, 0);
});

Deno.test("rejects a different active document without revealing either value", async () => {
  const fixture = database({
    async getActiveBillingIdentity() {
      return await stored("529.982.247-25");
    },
  });
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  try {
    await registrar.register(userId, "order-1", "04.252.011/0001-10");
  } catch (error) {
    if (
      !(error instanceof BillingIdentityRegistrationError) ||
      error.code !== "IDENTITY_CONFLICT"
    ) throw error;
    if (error.message.includes("529") || error.message.includes("04.252")) {
      throw new Error("document leaked");
    }
    return;
  }
  throw new Error("expected identity conflict");
});

Deno.test("handles a concurrent winner as idempotent and does not retry insert", async () => {
  const winner = await stored("529.982.247-25");
  let inserts = 0;
  const fixture = database({
    async insertBillingIdentity() {
      inserts += 1;
      fixture.setActive(winner);
      throw new Error("unique violation");
    },
    async getActiveBillingIdentity() {
      return inserts === 0 ? null : winner;
    },
  });
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  const result = await registrar.register(userId, "order-1", "529.982.247-25");
  assertEquals(result.outcome, "reused");
  assertEquals(inserts, 1);
});

Deno.test("maps persistence failure without retrying or exposing document", async () => {
  const fixture = database({
    async insertBillingIdentity() {
      throw new Error("database failure");
    },
  });
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  try {
    await registrar.register(userId, "order-1", "529.982.247-25");
  } catch (error) {
    if (
      !(error instanceof BillingIdentityRegistrationError) ||
      error.code !== "PERSISTENCE_FAILED"
    ) throw error;
    if (error.message.includes("529")) throw new Error("document leaked");
    return;
  }
  throw new Error("expected persistence failure");
});

Deno.test("rejects invalid CPF/CNPJ before any database write", async () => {
  const fixture = database();
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  try {
    await registrar.register(userId, "order-1", "52998224724");
  } catch {
    assertEquals(fixture.inserted.length, 0);
    return;
  }
  throw new Error("expected invalid document to fail");
});

Deno.test("does not collect an identity for a zero-real purchase", async () => {
  const fixture = database({
    async hasPositiveRealAmountDue() {
      return false;
    },
  });
  const registrar = createBillingIdentityRegistrar({
    db: fixture.db,
    cryptoEnv: env,
  });
  try {
    await registrar.register(userId, "order-gemn-only", "529.982.247-25");
  } catch (error) {
    if (
      !(error instanceof BillingIdentityRegistrationError) ||
      error.code !== "PAYMENT_NOT_REQUIRED"
    ) throw error;
    assertEquals(fixture.inserted.length, 0);
    return;
  }
  throw new Error("expected GEMN-only purchase to skip identity");
});
