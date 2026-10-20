import {
  type BillingDocumentType,
  type BillingIdentityCryptoEnv,
  decryptBillingDocument,
} from "../billing-identity-crypto/index.ts";
import { type AsaasClient, AsaasClientError } from "../asaas-client/index.ts";

export interface StoredBillingIdentity {
  id: string;
  userId: string;
  documentType: BillingDocumentType;
  documentCiphertext: string;
  keyVersion: number;
  status: "active";
}

export interface CustomerProvisioningClaim {
  provisioningId: string;
  status: "pending" | "creating" | "ready" | "needs_review";
  claimGranted: boolean;
  claimToken: string | null;
  asaasCustomerRecordId: string | null;
  providerCustomerId: string | null;
}

export interface CustomerProvisioningDatabase {
  getBuyerProfile(userId: string): Promise<{ name: string; email?: string }>;
  getActiveBillingIdentity(
    userId: string,
  ): Promise<StoredBillingIdentity | null>;
  claimCustomerProvisioning(
    input: { billingIdentityId: string; ambiente: "sandbox" },
  ): Promise<CustomerProvisioningClaim>;
  finalizeCustomerProvisioning(input: {
    provisioningId: string;
    claimToken: string;
    providerCustomerId: string;
  }): Promise<
    {
      provisioningId: string;
      status: "ready";
      asaasCustomerRecordId: string;
      providerCustomerId: string;
    }
  >;
  markCustomerProvisioningNeedsReview(
    input: { provisioningId: string; claimToken: string },
  ): Promise<void>;
  releaseCustomerProvisioningClaim(
    input: { provisioningId: string; claimToken: string },
  ): Promise<void>;
}

export interface ProvisionedAsaasCustomer {
  outcome: "created" | "reused";
  billingIdentityId: string;
  provisioningId: string;
  localCustomerId: string;
  providerCustomerId: string;
  ambiente: "sandbox";
}

export class AsaasCustomerProvisioningError extends Error {
  readonly code:
    | "IDENTITY_UNAVAILABLE"
    | "PROVISIONING_IN_PROGRESS"
    | "PROVISIONING_NEEDS_REVIEW"
    | "ASAAS_REJECTED"
    | "ASAAS_UNAVAILABLE"
    | "ASAAS_TIMEOUT"
    | "INTERNAL_ERROR";
  readonly retryable: boolean;

  constructor(
    code: AsaasCustomerProvisioningError["code"],
    message: string,
    retryable = false,
  ) {
    super(message);
    this.name = "AsaasCustomerProvisioningError";
    this.code = code;
    this.retryable = retryable;
  }
}

type ProvisioningStage =
  | "profile"
  | "decryption"
  | "asaas_lookup"
  | "asaas_create"
  | "finalization";

const PROVISIONING_STAGE_TIMEOUT_MS = 10_000;

function withTimeout<T>(operation: Promise<T>): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("provisioning operation timed out")),
      PROVISIONING_STAGE_TIMEOUT_MS,
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

function diagnostic(stage: ProvisioningStage, code: string): void {
  console.error("asaas provisioning diagnostic", { stage, code });
}

function mapAsaasFailure(error: unknown): AsaasCustomerProvisioningError {
  if (error instanceof AsaasClientError) {
    if (error.uncertain || error.code === "TIMEOUT") {
      return new AsaasCustomerProvisioningError(
        "ASAAS_TIMEOUT",
        "O resultado do provisionamento não pôde ser confirmado.",
      );
    }
    if (
      error.code === "HTTP_ERROR" && error.status !== null &&
      error.status >= 400 && error.status < 500
    ) {
      return new AsaasCustomerProvisioningError(
        "ASAAS_REJECTED",
        "O provedor rejeitou o customer.",
      );
    }
  }
  return new AsaasCustomerProvisioningError(
    "ASAAS_UNAVAILABLE",
    "Não foi possível consultar o provedor.",
  );
}

function requiredClaimToken(claim: CustomerProvisioningClaim): string {
  if (!claim.claimToken) {
    throw new AsaasCustomerProvisioningError(
      "INTERNAL_ERROR",
      "O claim de provisionamento não possui token válido.",
    );
  }
  return claim.claimToken;
}

async function markNeedsReview(
  db: CustomerProvisioningDatabase,
  claim: CustomerProvisioningClaim,
  error: AsaasCustomerProvisioningError,
  stage: ProvisioningStage,
): Promise<never> {
  diagnostic(stage, error.code);
  if (claim.claimToken) {
    try {
      await withTimeout(db.markCustomerProvisioningNeedsReview({
        provisioningId: claim.provisioningId,
        claimToken: claim.claimToken,
      }));
    } catch {
      // The external outcome remains unknown. Never retry a provider POST.
    }
  }
  throw new AsaasCustomerProvisioningError(
    "PROVISIONING_NEEDS_REVIEW",
    error.message,
  );
}

async function releaseClaimBeforeExternalCreate(
  db: CustomerProvisioningDatabase,
  claim: CustomerProvisioningClaim,
  stage: ProvisioningStage,
): Promise<void> {
  if (!claim.claimToken) return;
  try {
    await withTimeout(db.releaseCustomerProvisioningClaim({
      provisioningId: claim.provisioningId,
      claimToken: claim.claimToken,
    }));
  } catch {
    diagnostic(stage, "CLAIM_RELEASE_FAILED");
  }
}

export function createAsaasCustomerProvisioner(options: {
  db: CustomerProvisioningDatabase;
  asaas: Pick<AsaasClient, "findCustomer" | "createCustomer">;
  cryptoEnv: BillingIdentityCryptoEnv;
}) {
  return {
    async provision(userId: string): Promise<ProvisionedAsaasCustomer> {
      const identity = await withTimeout(
        options.db.getActiveBillingIdentity(userId),
      );
      if (
        !identity || identity.userId !== userId || identity.status !== "active"
      ) {
        throw new AsaasCustomerProvisioningError(
          "IDENTITY_UNAVAILABLE",
          "A identidade de cobrança não está disponível.",
        );
      }

      const claim = await withTimeout(options.db.claimCustomerProvisioning({
        billingIdentityId: identity.id,
        ambiente: "sandbox",
      }));

      if (!claim.claimGranted) {
        if (
          claim.status === "ready" && claim.asaasCustomerRecordId &&
          claim.providerCustomerId
        ) {
          return {
            outcome: "reused",
            billingIdentityId: identity.id,
            provisioningId: claim.provisioningId,
            localCustomerId: claim.asaasCustomerRecordId,
            providerCustomerId: claim.providerCustomerId,
            ambiente: "sandbox",
          };
        }
        if (claim.status === "needs_review") {
          throw new AsaasCustomerProvisioningError(
            "PROVISIONING_NEEDS_REVIEW",
            "O provisionamento precisa ser revisado.",
          );
        }
        throw new AsaasCustomerProvisioningError(
          "PROVISIONING_IN_PROGRESS",
          "Já existe um provisionamento em andamento.",
        );
      }

      const claimToken = requiredClaimToken(claim);
      let profile: { name: string; email?: string };
      try {
        profile = await withTimeout(options.db.getBuyerProfile(userId));
      } catch {
        const error = new AsaasCustomerProvisioningError(
          "INTERNAL_ERROR",
          "O perfil do comprador não está disponível.",
        );
        diagnostic("profile", error.code);
        await releaseClaimBeforeExternalCreate(options.db, claim, "profile");
        throw error;
      }
      let document: string;
      try {
        document = (await withTimeout(decryptBillingDocument(
          userId,
          identity.documentCiphertext,
          options.cryptoEnv,
          identity.documentType,
        ))).normalized;
      } catch {
        const error = new AsaasCustomerProvisioningError(
          "INTERNAL_ERROR",
          "Não foi possível abrir a identidade de cobrança.",
        );
        diagnostic("decryption", error.code);
        await releaseClaimBeforeExternalCreate(options.db, claim, "decryption");
        throw error;
      }

      let providerCustomerId: string;
      let existing: Awaited<ReturnType<AsaasClient["findCustomer"]>>;
      try {
        existing = await withTimeout(options.asaas.findCustomer({
          cpfCnpj: document,
        }));
      } catch (error) {
        const mapped = mapAsaasFailure(error);
        diagnostic("asaas_lookup", mapped.code);
        await releaseClaimBeforeExternalCreate(options.db, claim, "asaas_lookup");
        throw mapped;
      }

      if (existing) {
        providerCustomerId = existing.id;
      } else {
        try {
          const created = await withTimeout(options.asaas.createCustomer({
            name: profile.name,
            cpfCnpj: document,
            email: profile.email,
            externalReference: `gemn-billing-identity-${identity.id}`,
          }));
          providerCustomerId = created.id;
        } catch (error) {
          const mapped = mapAsaasFailure(error);
          if (mapped.code === "ASAAS_REJECTED") {
            diagnostic("asaas_create", mapped.code);
            throw mapped;
          }
          return markNeedsReview(options.db, claim, mapped, "asaas_create");
        }
      }

      if (!providerCustomerId) {
        const error = new AsaasCustomerProvisioningError(
          "INTERNAL_ERROR",
          "O Asaas não retornou um identificador de customer.",
        );
        diagnostic("asaas_create", error.code);
        await releaseClaimBeforeExternalCreate(options.db, claim, "asaas_create");
        throw error;
      }

      try {
        const finalized = await withTimeout(options.db.finalizeCustomerProvisioning({
          provisioningId: claim.provisioningId,
          claimToken,
          providerCustomerId,
        }));
        return {
          outcome: "created",
          billingIdentityId: identity.id,
          provisioningId: finalized.provisioningId,
          localCustomerId: finalized.asaasCustomerRecordId,
          providerCustomerId: finalized.providerCustomerId,
          ambiente: "sandbox",
        };
      } catch {
        return markNeedsReview(
          options.db,
          claim,
          new AsaasCustomerProvisioningError(
            "INTERNAL_ERROR",
            "O vínculo do customer precisa ser reconciliado.",
          ),
          "finalization",
        );
      }
    },
  };
}
