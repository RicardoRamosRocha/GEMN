import {
  type BillingDocumentType,
  type BillingIdentityCryptoEnv,
  encryptBillingDocument,
  fingerprintBillingDocument,
} from "../billing-identity-crypto/index.ts";

export interface StoredBillingIdentityRegistration {
  id: string;
  userId: string;
  identityVersion: number;
  documentType: BillingDocumentType;
  documentFingerprint: string;
  documentLast4: string;
  keyVersion: number;
  status: "active";
}

export interface BillingIdentityRegistrationDatabase {
  hasPositiveRealAmountDue(userId: string, orderId: string): Promise<boolean>;
  getActiveBillingIdentity(
    userId: string,
  ): Promise<StoredBillingIdentityRegistration | null>;
  getLatestIdentityVersion(userId: string): Promise<number>;
  insertBillingIdentity(input: {
    userId: string;
    identityVersion: number;
    documentType: BillingDocumentType;
    documentCiphertext: string;
    documentFingerprint: string;
    documentLast4: string;
    keyVersion: number;
  }): Promise<StoredBillingIdentityRegistration>;
}

export class BillingIdentityRegistrationError extends Error {
  readonly code:
    | "PAYMENT_NOT_REQUIRED"
    | "IDENTITY_CONFLICT"
    | "PERSISTENCE_FAILED"
    | "INTERNAL_ERROR";

  constructor(
    code: BillingIdentityRegistrationError["code"],
    message: string,
  ) {
    super(message);
    this.name = "BillingIdentityRegistrationError";
    this.code = code;
  }
}

function sameIdentity(
  identity: StoredBillingIdentityRegistration,
  userId: string,
  documentType: BillingDocumentType,
  fingerprint: string,
): boolean {
  return identity.userId === userId && identity.status === "active" &&
    identity.documentType === documentType &&
    identity.documentFingerprint === fingerprint;
}

export function createBillingIdentityRegistrar(options: {
  db: BillingIdentityRegistrationDatabase;
  cryptoEnv: BillingIdentityCryptoEnv;
}) {
  return {
    async register(userId: string, orderId: string, document: string): Promise<{
      outcome: "created" | "reused";
      identity: StoredBillingIdentityRegistration;
    }> {
      if (!await options.db.hasPositiveRealAmountDue(userId, orderId)) {
        throw new BillingIdentityRegistrationError(
          "PAYMENT_NOT_REQUIRED",
          "A identidade só é necessária para uma compra com valor em reais.",
        );
      }
      const encrypted = await encryptBillingDocument(
        userId,
        document,
        options.cryptoEnv,
      );
      const fingerprint = await fingerprintBillingDocument(
        document,
        options.cryptoEnv,
        encrypted.documentType,
      );
      const existing = await options.db.getActiveBillingIdentity(userId);
      if (existing) {
        if (
          sameIdentity(
            existing,
            userId,
            encrypted.documentType,
            fingerprint.fingerprint,
          )
        ) {
          return { outcome: "reused", identity: existing };
        }
        throw new BillingIdentityRegistrationError(
          "IDENTITY_CONFLICT",
          "A identidade de cobrança já está cadastrada.",
        );
      }

      const identityVersion =
        await options.db.getLatestIdentityVersion(userId) + 1;
      try {
        const identity = await options.db.insertBillingIdentity({
          userId,
          identityVersion,
          documentType: encrypted.documentType,
          documentCiphertext: encrypted.ciphertext,
          documentFingerprint: fingerprint.fingerprint,
          documentLast4: encrypted.documentLast4,
          keyVersion: encrypted.keyVersion,
        });
        return { outcome: "created", identity };
      } catch {
        // A concurrent request may have won the active partial unique index.
        // Re-read only opaque metadata; never retry the insert automatically.
        const concurrent = await options.db.getActiveBillingIdentity(userId);
        if (
          concurrent &&
          sameIdentity(
            concurrent,
            userId,
            encrypted.documentType,
            fingerprint.fingerprint,
          )
        ) {
          return { outcome: "reused", identity: concurrent };
        }
        if (concurrent) {
          throw new BillingIdentityRegistrationError(
            "IDENTITY_CONFLICT",
            "A identidade de cobrança já está cadastrada.",
          );
        }
        throw new BillingIdentityRegistrationError(
          "PERSISTENCE_FAILED",
          "Não foi possível cadastrar a identidade de cobrança.",
        );
      }
    },
  };
}
