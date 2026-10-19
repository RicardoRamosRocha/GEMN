import {
  AsaasClientError,
  type AsaasClient,
  type AsaasCustomer,
  type AsaasPayment,
} from '../asaas-client/index.ts';

export type PaymentIntentStatus =
  | 'pending_creation'
  | 'creating'
  | 'created'
  | 'qr_ready'
  | 'needs_reconciliation'
  | 'failed'
  | 'canceled'
  | 'overdue';

export class PixOrchestrationError extends Error {
  readonly code:
    | 'UNAUTHORIZED'
    | 'INVALID_REQUEST'
    | 'ORDER_NOT_ELIGIBLE'
    | 'PAYMENT_ALREADY_CREATED'
    | 'PAYMENT_ALREADY_IN_PROGRESS'
    | 'PAYMENT_NEEDS_RECONCILIATION'
    | 'CUSTOMER_UNAVAILABLE'
    | 'ASAAS_REJECTED'
    | 'ASAAS_UNAVAILABLE'
    | 'ASAAS_TIMEOUT'
    | 'INTERNAL_ERROR';
  readonly retryable: boolean;

  constructor(code: PixOrchestrationError['code'], message: string, retryable = false) {
    super(message);
    this.name = 'PixOrchestrationError';
    this.code = code;
    this.retryable = retryable;
  }
}

export interface AuthenticatedBuyer {
  userId: string;
}

export interface BuyerProfile {
  name: string;
  cpfCnpj: string;
  email?: string;
}

export interface PreparedPaymentIntent {
  paymentIntentId: string;
  orderId: string;
  status: PaymentIntentStatus;
  amountDueReal: number;
  currency: 'BRL';
  ambiente: 'sandbox';
  externalReference: string;
  dueAt: string;
}

export interface PaymentClaim {
  paymentIntentId: string;
  status: PaymentIntentStatus | 'creating';
  claimGranted: boolean;
  claimToken: string | null;
  asaasPaymentId: string | null;
}

export interface StoredCustomer {
  id: string;
  providerCustomerId: string;
  status: 'active' | 'inactive' | 'needs_review';
  ambiente: 'sandbox';
}

export interface PaymentDatabase {
  preparePaymentIntent(input: {
    userId: string;
    orderId: string;
    idempotencyKey: string;
  }): Promise<PreparedPaymentIntent>;
  claimPaymentCreation(input: { paymentIntentId: string }): Promise<PaymentClaim>;
  getCustomer(input: { userId: string; ambiente: 'sandbox' }): Promise<StoredCustomer | null>;
  getBuyerProfile(userId: string): Promise<BuyerProfile>;
  saveCustomer(input: {
    userId: string;
    ambiente: 'sandbox';
    providerCustomerId: string;
  }): Promise<StoredCustomer>;
  finalizePaymentCreation(input: {
    paymentIntentId: string;
    claimToken: string;
    asaasPaymentId: string;
    providerCustomerId: string;
    providerStatus: string;
    amountDueReal: number;
    externalReference: string;
  }): Promise<{ status: 'created'; asaasPaymentId: string }>;
  failPaymentCreation(input: {
    paymentIntentId: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void>;
  markNeedsReconciliation(input: {
    paymentIntentId: string;
    claimToken: string;
    errorCode: string;
  }): Promise<void>;
}

export interface PixAuthenticator<TContext = unknown> {
  authenticate(context: TContext): Promise<AuthenticatedBuyer>;
}

export interface CreatePixInput<TContext = unknown> {
  context: TContext;
  orderId: string;
  idempotencyKey: string;
}

export interface CreatedPixPayment {
  outcome: 'created';
  paymentIntentId: string;
  asaasPaymentId: string;
  amountDueReal: number;
  externalReference: string;
  providerStatus: string;
}

export interface ReusedPixPayment {
  outcome: 'reused';
  paymentIntentId: string;
  asaasPaymentId: string;
  status: 'created' | 'qr_ready';
}

export type CreatePixResult = CreatedPixPayment | ReusedPixPayment;

export interface PixOrchestratorDependencies<TContext = unknown> {
  auth: PixAuthenticator<TContext>;
  db: PaymentDatabase;
  asaas: AsaasClient;
}

function isPositiveAmount(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function mapAsaasError(error: unknown): PixOrchestrationError {
  if (error instanceof AsaasClientError) {
    if (error.uncertain || error.code === 'TIMEOUT') {
      return new PixOrchestrationError('ASAAS_TIMEOUT', 'O resultado da cobrança não pôde ser confirmado.');
    }
    if (error.code === 'UNAVAILABLE') {
      return new PixOrchestrationError('ASAAS_UNAVAILABLE', 'O provedor de pagamentos está indisponível.');
    }
    return new PixOrchestrationError('ASAAS_REJECTED', 'O provedor rejeitou a cobrança Pix.');
  }
  return new PixOrchestrationError('ASAAS_UNAVAILABLE', 'Não foi possível comunicar com o provedor.');
}

function isUncertainAsaasFailure(error: unknown): boolean {
  return error instanceof AsaasClientError ? error.uncertain || error.code === 'TIMEOUT' : false;
}

function dueDate(dueAt: string): string {
  const date = new Date(dueAt);
  if (!Number.isFinite(date.getTime())) {
    throw new PixOrchestrationError('ORDER_NOT_ELIGIBLE', 'O vencimento do pedido é inválido.');
  }
  return date.toISOString().slice(0, 10);
}

async function resolveCustomer(
  userId: string,
  db: PaymentDatabase,
  asaas: AsaasClient,
): Promise<StoredCustomer> {
  const stored = await db.getCustomer({ userId, ambiente: 'sandbox' });
  if (stored) {
    if (stored.status !== 'active' || !stored.providerCustomerId) {
      throw new PixOrchestrationError('CUSTOMER_UNAVAILABLE', 'O customer do comprador não está apto para cobrança.');
    }
    return stored;
  }

  const profile = await db.getBuyerProfile(userId);
  let providerCustomer: AsaasCustomer | null;
  try {
    providerCustomer = await asaas.findCustomer({ cpfCnpj: profile.cpfCnpj });
    if (!providerCustomer) {
      providerCustomer = await asaas.createCustomer({
        name: profile.name,
        cpfCnpj: profile.cpfCnpj,
        email: profile.email,
      });
    }
  } catch (error) {
    throw mapAsaasError(error);
  }
  return db.saveCustomer({ userId, ambiente: 'sandbox', providerCustomerId: providerCustomer.id });
}

async function requestReconciliation(
  db: PaymentDatabase,
  input: { paymentIntentId: string; claimToken: string; errorCode: string },
): Promise<void> {
  try {
    await db.markNeedsReconciliation(input);
  } catch {
    // The external result is still uncertain; never turn this into another POST.
  }
}

export function createPixOrchestrator<TContext>(
  dependencies: PixOrchestratorDependencies<TContext>,
) {
  return {
    async create(input: CreatePixInput<TContext>): Promise<CreatePixResult> {
      if (!input.orderId.trim() || !input.idempotencyKey.trim()) {
        throw new PixOrchestrationError('INVALID_REQUEST', 'Pedido e chave de idempotência são obrigatórios.');
      }

      let buyer: AuthenticatedBuyer;
      try {
        buyer = await dependencies.auth.authenticate(input.context);
      } catch {
        throw new PixOrchestrationError('UNAUTHORIZED', 'É necessário estar autenticado.');
      }

      let intent: PreparedPaymentIntent;
      try {
        intent = await dependencies.db.preparePaymentIntent({
          userId: buyer.userId,
          orderId: input.orderId,
          idempotencyKey: input.idempotencyKey,
        });
      } catch {
        throw new PixOrchestrationError('ORDER_NOT_ELIGIBLE', 'O pedido não está elegível para Pix.');
      }

      if (intent.ambiente !== 'sandbox' || intent.currency !== 'BRL' || !isPositiveAmount(intent.amountDueReal)) {
        throw new PixOrchestrationError('ORDER_NOT_ELIGIBLE', 'O pedido não possui valor Pix elegível.');
      }
      if (intent.status === 'needs_reconciliation') {
        throw new PixOrchestrationError('PAYMENT_NEEDS_RECONCILIATION', 'O pagamento precisa ser reconciliado.');
      }
      if (intent.status === 'canceled' || intent.status === 'overdue' || intent.status === 'failed') {
        throw new PixOrchestrationError('ORDER_NOT_ELIGIBLE', 'O pedido não está elegível para Pix.');
      }

      let claim: PaymentClaim;
      try {
        claim = await dependencies.db.claimPaymentCreation({ paymentIntentId: intent.paymentIntentId });
      } catch {
        throw new PixOrchestrationError('ORDER_NOT_ELIGIBLE', 'O pagamento não está elegível para criação.');
      }

      if (!claim.claimGranted) {
        if (claim.status === 'needs_reconciliation') {
          throw new PixOrchestrationError('PAYMENT_NEEDS_RECONCILIATION', 'O pagamento precisa ser reconciliado.');
        }
        if ((claim.status === 'created' || claim.status === 'qr_ready') && claim.asaasPaymentId) {
          return {
            outcome: 'reused',
            paymentIntentId: intent.paymentIntentId,
            asaasPaymentId: claim.asaasPaymentId,
            status: claim.status,
          };
        }
        throw new PixOrchestrationError('PAYMENT_ALREADY_IN_PROGRESS', 'Já existe uma criação de pagamento em andamento.');
      }

      if (!claim.claimToken) {
        throw new PixOrchestrationError('INTERNAL_ERROR', 'O claim de pagamento não possui token válido.');
      }

      let customer: StoredCustomer;
      try {
        customer = await resolveCustomer(buyer.userId, dependencies.db, dependencies.asaas);
      } catch (error) {
        if (error instanceof PixOrchestrationError) {
          await dependencies.db.failPaymentCreation({
            paymentIntentId: intent.paymentIntentId,
            claimToken: claim.claimToken,
            errorCode: error.code,
          });
          throw error;
        }
        await dependencies.db.failPaymentCreation({
          paymentIntentId: intent.paymentIntentId,
          claimToken: claim.claimToken,
          errorCode: 'CUSTOMER_UNAVAILABLE',
        });
        throw new PixOrchestrationError('CUSTOMER_UNAVAILABLE', 'Não foi possível resolver o customer.');
      }

      let payment: AsaasPayment;
      try {
        payment = await dependencies.asaas.createPixPayment({
          customerId: customer.providerCustomerId,
          amountDueReal: intent.amountDueReal,
          dueDate: dueDate(intent.dueAt),
          externalReference: intent.externalReference,
        });
      } catch (error) {
        if (isUncertainAsaasFailure(error)) {
          await requestReconciliation(dependencies.db, {
            paymentIntentId: intent.paymentIntentId,
            claimToken: claim.claimToken,
            errorCode: 'ASAAS_TIMEOUT',
          });
          throw new PixOrchestrationError('PAYMENT_NEEDS_RECONCILIATION', 'A cobrança pode ter sido criada e precisa ser reconciliada.');
        }
        const mapped = mapAsaasError(error);
        await dependencies.db.failPaymentCreation({
          paymentIntentId: intent.paymentIntentId,
          claimToken: claim.claimToken,
          errorCode: mapped.code,
        });
        throw mapped;
      }

      try {
        const finalized = await dependencies.db.finalizePaymentCreation({
          paymentIntentId: intent.paymentIntentId,
          claimToken: claim.claimToken,
          asaasPaymentId: payment.id,
          providerCustomerId: customer.providerCustomerId,
          providerStatus: payment.status,
          amountDueReal: intent.amountDueReal,
          externalReference: intent.externalReference,
        });
        return {
          outcome: 'created',
          paymentIntentId: intent.paymentIntentId,
          asaasPaymentId: finalized.asaasPaymentId,
          amountDueReal: intent.amountDueReal,
          externalReference: intent.externalReference,
          providerStatus: payment.status,
        };
      } catch {
        await requestReconciliation(dependencies.db, {
          paymentIntentId: intent.paymentIntentId,
          claimToken: claim.claimToken,
          errorCode: 'FINALIZATION_FAILED',
        });
        throw new PixOrchestrationError('PAYMENT_NEEDS_RECONCILIATION', 'A cobrança foi criada, mas sua persistência precisa ser reconciliada.');
      }
    },
  };
}
