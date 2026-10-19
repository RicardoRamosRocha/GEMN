import type {
  CustomerProvisioningClaim,
  CustomerProvisioningDatabase,
  StoredBillingIdentity,
} from "../asaas-customer-provisioning/index.ts";
import type {
  SupabaseAdminPort,
  SupabaseQueryPort,
  SupabaseResult,
} from "../asaas-supabase-adapter/index.ts";

export interface SupabaseCustomerProvisioningAdminPort
  extends SupabaseAdminPort {
  auth: {
    admin: {
      getUserById(userId: string): Promise<{
        data: { user: { email?: string | null } | null };
        error: unknown;
      }>;
    };
  };
}

export class SupabaseCustomerProvisioningAdapterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseCustomerProvisioningAdapterError";
  }
}

function object(value: unknown, context: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SupabaseCustomerProvisioningAdapterError(
      `Invalid ${context} response`,
    );
  }
  return value as Record<string, unknown>;
}

function row(data: unknown, context: string): Record<string, unknown> {
  if (!Array.isArray(data) || data.length !== 1) {
    throw new SupabaseCustomerProvisioningAdapterError(
      `Invalid ${context} RPC response`,
    );
  }
  return object(data[0], context);
}

function text(value: unknown, field: string, context: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new SupabaseCustomerProvisioningAdapterError(
      `Invalid ${field} in ${context} response`,
    );
  }
  return value.trim();
}

function nullableText(
  value: unknown,
  field: string,
  context: string,
): string | null {
  return value === null ? null : text(value, field, context);
}

function integer(value: unknown, field: string, context: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new SupabaseCustomerProvisioningAdapterError(
      `Invalid ${field} in ${context} response`,
    );
  }
  return value;
}

async function rpc(
  client: SupabaseAdminPort,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const result: SupabaseResult = await client.rpc(name, args);
  if (result.error) {
    throw new SupabaseCustomerProvisioningAdapterError(`${name} RPC failed`);
  }
  return row(result.data, name);
}

export function createSupabaseCustomerProvisioningAdapter(options: {
  adminClient: SupabaseCustomerProvisioningAdminPort;
}): CustomerProvisioningDatabase {
  const admin = options.adminClient;
  return {
    async getBuyerProfile(userId) {
      const profileResult = await admin
        .from("profiles")
        .select("id, nome_completo")
        .eq("id", userId)
        .maybeSingle();
      if (profileResult.error || profileResult.data === null) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "buyer profile lookup failed",
        );
      }
      const profile = object(profileResult.data, "buyer profile");
      const name = text(
        profile.nome_completo,
        "nome_completo",
        "buyer profile",
      );
      const authResult = await admin.auth.admin.getUserById(userId);
      if (authResult.error || !authResult.data.user) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "buyer auth profile lookup failed",
        );
      }
      return {
        name,
        ...(authResult.data.user.email
          ? { email: authResult.data.user.email }
          : {}),
      };
    },

    async getActiveBillingIdentity(
      userId,
    ): Promise<StoredBillingIdentity | null> {
      const result = await admin
        .from("billing_identities")
        .select(
          "id, user_id, document_type, document_ciphertext, key_version, status",
        )
        .eq("user_id", userId)
        .eq("status", "active")
        .maybeSingle();
      if (result.error) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "billing identity lookup failed",
        );
      }
      if (result.data === null) return null;
      const value = object(result.data, "billing identity");
      const status = text(value.status, "status", "billing identity");
      const documentType = text(
        value.document_type,
        "document_type",
        "billing identity",
      );
      if (
        status !== "active" ||
        (documentType !== "cpf" && documentType !== "cnpj")
      ) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "Billing identity state is invalid",
        );
      }
      return {
        id: text(value.id, "id", "billing identity"),
        userId: text(value.user_id, "user_id", "billing identity"),
        documentType,
        documentCiphertext: text(
          value.document_ciphertext,
          "document_ciphertext",
          "billing identity",
        ),
        keyVersion: integer(
          value.key_version,
          "key_version",
          "billing identity",
        ),
        status: "active",
      };
    },

    async claimCustomerProvisioning(input): Promise<CustomerProvisioningClaim> {
      const value = await rpc(admin, "claim_asaas_customer_provisioning", {
        p_billing_identity_id: input.billingIdentityId,
        p_ambiente: input.ambiente,
      });
      const status = text(
        value.status,
        "status",
        "claim_asaas_customer_provisioning",
      );
      if (!["pending", "creating", "ready", "needs_review"].includes(status)) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "Invalid provisioning status",
        );
      }
      if (typeof value.claim_granted !== "boolean") {
        throw new SupabaseCustomerProvisioningAdapterError(
          "Invalid claim_granted in claim_asaas_customer_provisioning response",
        );
      }
      return {
        provisioningId: text(
          value.provisioning_id,
          "provisioning_id",
          "claim_asaas_customer_provisioning",
        ),
        status: status as CustomerProvisioningClaim["status"],
        claimGranted: value.claim_granted,
        claimToken: nullableText(
          value.claim_token,
          "claim_token",
          "claim_asaas_customer_provisioning",
        ),
        asaasCustomerRecordId: nullableText(
          value.asaas_customer_record_id,
          "asaas_customer_record_id",
          "claim_asaas_customer_provisioning",
        ),
        providerCustomerId: nullableText(
          value.provider_customer_id,
          "provider_customer_id",
          "claim_asaas_customer_provisioning",
        ),
      };
    },

    async finalizeCustomerProvisioning(input) {
      const value = await rpc(admin, "finalize_asaas_customer_provisioning", {
        p_provisioning_id: input.provisioningId,
        p_claim_token: input.claimToken,
        p_provider_customer_id: input.providerCustomerId,
      });
      if (
        text(value.status, "status", "finalize_asaas_customer_provisioning") !==
          "ready"
      ) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "Provisioning finalization returned an unexpected status",
        );
      }
      return {
        provisioningId: text(
          value.provisioning_id,
          "provisioning_id",
          "finalize_asaas_customer_provisioning",
        ),
        status: "ready" as const,
        asaasCustomerRecordId: text(
          value.asaas_customer_record_id,
          "asaas_customer_record_id",
          "finalize_asaas_customer_provisioning",
        ),
        providerCustomerId: text(
          value.provider_customer_id,
          "provider_customer_id",
          "finalize_asaas_customer_provisioning",
        ),
      };
    },

    async markCustomerProvisioningNeedsReview(input) {
      const value = await rpc(
        admin,
        "mark_asaas_customer_provisioning_needs_review",
        {
          p_provisioning_id: input.provisioningId,
          p_claim_token: input.claimToken,
        },
      );
      if (
        text(
          value.status,
          "status",
          "mark_asaas_customer_provisioning_needs_review",
        ) !== "needs_review"
      ) {
        throw new SupabaseCustomerProvisioningAdapterError(
          "Provisioning review transition returned an unexpected status",
        );
      }
    },
  };
}

export type CustomerProvisioningQueryPort = SupabaseQueryPort;
