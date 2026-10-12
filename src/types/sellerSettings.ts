export type SellerSettingsErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'conflict'
  | 'network'
  | 'unexpected';

export type SellerSettings = {
  sellerId: string;
  storeName: string;
  status: 'ativo' | 'suspenso';
  aceitaGemn: boolean;
  cashbackPercentual: number | null;
};

export type SellerGemnAcceptanceResult = {
  sellerId: string;
  aceitaGemn: boolean;
};

export type SellerCashbackRule = {
  ruleId: string;
  sellerId: string;
  percentual: number;
  vigenteDesde: string;
  vigenteAte: string | null;
};

export type UpdateCashbackParams = {
  percentual: number;
  /** Preserve this value when retrying the same operation. */
  idempotencyKey: string;
};

export class SellerSettingsServiceError extends Error {
  readonly kind: SellerSettingsErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    kind: SellerSettingsErrorKind,
    message: string,
    code?: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'SellerSettingsServiceError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}
