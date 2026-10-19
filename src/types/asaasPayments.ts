export type AsaasEnvironment = 'sandbox' | 'production';
export type PaymentMethod = 'pix';

export type PaymentIntentStatus =
  | 'pending_creation'
  | 'creating'
  | 'created'
  | 'qr_ready'
  | 'payment_confirmed'
  | 'payment_received'
  | 'overdue'
  | 'canceled'
  | 'refunded'
  | 'partially_refunded'
  | 'chargeback'
  | 'failed'
  | 'needs_reconciliation';

export type AsaasCustomerStatus = 'active' | 'inactive' | 'needs_review';

export interface PrepareAsaasPaymentIntentResult {
  paymentIntentId: string;
  orderId: string;
  status: PaymentIntentStatus;
  amountDueReal: number;
  currency: 'BRL';
  ambiente: AsaasEnvironment;
  externalReference: string;
  dueAt: string;
}

export interface AsaasCustomer {
  id: string;
  userId: string;
  ambiente: AsaasEnvironment;
  providerCustomerId: string;
  status: AsaasCustomerStatus;
}

export interface AsaasPaymentClaim {
  paymentIntentId: string;
  status: 'creating' | PaymentIntentStatus;
  claimGranted: boolean;
  claimToken: string | null;
  leaseExpiresAt: string | null;
  creationAttempts: number;
  asaasPaymentId: string | null;
}

export interface FinalizeAsaasPaymentCreationResult {
  paymentIntentId: string;
  status: 'created';
  asaasPaymentId: string;
  amountDueReal: number;
  externalReference: string;
}

export interface AsaasCreationTransitionResult {
  paymentIntentId: string;
  status: 'failed' | 'needs_reconciliation';
}

export interface PixQrCode {
  encodedImage: string | null;
  payload: string | null;
  expiresAt: string | null;
}

export interface CreatePixPaymentRequest {
  orderId: string;
  idempotencyKey: string;
}

export interface CreatePixPaymentResponse {
  paymentIntent: PrepareAsaasPaymentIntentResult;
  customer: Pick<AsaasCustomer, 'id' | 'ambiente' | 'status'>;
  payment: {
    status: Extract<PaymentIntentStatus, 'created' | 'qr_ready'>;
    asaasPaymentId: string;
    amountDueReal: number;
    externalReference: string;
  };
  qrCode: PixQrCode;
}

export type AsaasPaymentErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_REQUEST'
  | 'ORDER_NOT_ELIGIBLE'
  | 'PAYMENT_INTENT_NOT_FOUND'
  | 'PAYMENT_ALREADY_IN_PROGRESS'
  | 'PAYMENT_NEEDS_RECONCILIATION'
  | 'PAYMENT_ALREADY_CREATED'
  | 'ASAAS_UNAVAILABLE'
  | 'ASAAS_TIMEOUT'
  | 'ASAAS_REJECTED'
  | 'INTERNAL_ERROR';

export class AsaasPaymentError extends Error {
  readonly code: AsaasPaymentErrorCode;
  readonly retryable: boolean;

  constructor(code: AsaasPaymentErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'AsaasPaymentError';
    this.code = code;
    this.retryable = retryable;
  }
}
