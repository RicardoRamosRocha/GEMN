import type {
  BillingIdentityRegistrationDatabase,
  StoredBillingIdentityRegistration,
} from "../billing-identity-registration/index.ts";
import type { BillingDocumentType } from "../billing-identity-crypto/index.ts";
import type {
  SupabaseQueryPort,
  SupabaseResult,
} from "../asaas-supabase-adapter/index.ts";

export interface BillingIdentityRegistrationTablePort {
  select(columns: string): SupabaseQueryPort;
  insert(values: Record<string, unknown>): PromiseLike<SupabaseResult>;
}

export interface BillingIdentityRegistrationAdminPort {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<SupabaseResult>;
  from(table: string): BillingIdentityRegistrationTablePort;
}

export class BillingIdentityRegistrationAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BillingIdentityRegistrationAdapterError";
  }
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new BillingIdentityRegistrationAdapterError(
      `Invalid ${context} response`,
    );
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new BillingIdentityRegistrationAdapterError(
      `Invalid ${field} in ${context} response`,
    );
  }
  return value.trim();
}

function positiveInteger(
  value: unknown,
  field: string,
  context: string,
): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new BillingIdentityRegistrationAdapterError(
      `Invalid ${field} in ${context} response`,
    );
  }
  return value;
}

function identity(
  data: unknown,
  context: string,
): StoredBillingIdentityRegistration {
  const value = object(data, context);
  const status = text(value.status, "status", context);
  const documentType = text(value.document_type, "document_type", context);
  if (
    status !== "active" || (documentType !== "cpf" && documentType !== "cnpj")
  ) {
    throw new BillingIdentityRegistrationAdapterError(
      "Billing identity state is invalid",
    );
  }
  const last4 = text(value.document_last4, "document_last4", context);
  if (!/^\d{4}$/.test(last4)) {
    throw new BillingIdentityRegistrationAdapterError(
      "Billing identity last4 is invalid",
    );
  }
  return {
    id: text(value.id, "id", context),
    userId: text(value.user_id, "user_id", context),
    identityVersion: positiveInteger(
      value.identity_version,
      "identity_version",
      context,
    ),
    documentType: documentType as BillingDocumentType,
    documentFingerprint: text(
      value.document_fingerprint,
      "document_fingerprint",
      context,
    ),
    documentLast4: last4,
    keyVersion: positiveInteger(value.key_version, "key_version", context),
    status: "active",
  };
}

function queryError(result: SupabaseResult, context: string): never {
  void result;
  throw new BillingIdentityRegistrationAdapterError(`${context} query failed`);
}

export function createBillingIdentityRegistrationAdapter(options: {
  adminClient: BillingIdentityRegistrationAdminPort;
}): BillingIdentityRegistrationDatabase {
  const admin = options.adminClient;
  return {
    async hasPositiveRealAmountDue(userId, orderId) {
      const result = await admin
        .from("orders")
        .select("id, buyer_id, valor_devido_real")
        .eq("id", orderId)
        .eq("buyer_id", userId)
        .maybeSingle();
      if (result.error) queryError(result, "order payment requirement");
      if (result.data === null) return false;
      const value =
        object(result.data, "order payment requirement").valor_devido_real;
      const amount = typeof value === "number"
        ? value
        : typeof value === "string"
        ? Number(value)
        : NaN;
      return Number.isFinite(amount) && amount > 0;
    },

    async getActiveBillingIdentity(userId) {
      const result = await admin
        .from("billing_identities")
        .select(
          "id, user_id, identity_version, document_type, document_fingerprint, document_last4, key_version, status",
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (result.error) queryError(result, "active billing identity");
      return result.data === null
        ? null
        : identity(result.data, "active billing identity");
    },

    async getLatestIdentityVersion(userId) {
      const query = admin
        .from("billing_identities")
        .select("identity_version")
        .eq("user_id", userId);
      const result = await query.order("identity_version", { ascending: false })
        .limit(1).maybeSingle();
      if (result.error) queryError(result, "billing identity version");
      if (result.data === null) return 0;
      return positiveInteger(
        object(result.data, "billing identity version").identity_version,
        "identity_version",
        "billing identity version",
      );
    },

    async insertBillingIdentity(input) {
      const result = await admin.from("billing_identities").insert({
        user_id: input.userId,
        identity_version: input.identityVersion,
        document_type: input.documentType,
        document_ciphertext: input.documentCiphertext,
        document_fingerprint: input.documentFingerprint,
        document_last4: input.documentLast4,
        key_version: input.keyVersion,
        status: "active",
      });
      if (result.error) queryError(result, "billing identity insert");
      const persisted = await admin
        .from("billing_identities")
        .select(
          "id, user_id, identity_version, document_type, document_fingerprint, document_last4, key_version, status",
        )
        .eq("user_id", input.userId)
        .eq("status", "active")
        .maybeSingle();
      if (persisted.error || persisted.data === null) {
        throw new BillingIdentityRegistrationAdapterError(
          "billing identity insert could not be verified",
        );
      }
      return identity(persisted.data, "billing identity insert");
    },
  };
}
