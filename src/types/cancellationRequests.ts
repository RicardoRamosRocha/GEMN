export type CancellationRequestStatus =
  | 'pendente'
  | 'aprovada'
  | 'rejeitada'
  | 'execucao_falhou';

export type CancellationRequesterRole = 'comprador' | 'vendedor';

export type CancellationServiceErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'conflict'
  | 'recoverable'
  | 'network'
  | 'unexpected';

export type CancellationRequestResult = {
  requestId: string;
  orderId: string;
  status: CancellationRequestStatus;
  requesterRole: CancellationRequesterRole;
  requesterSellerId: string | null;
  motivoSolicitacao: string;
  criadoEm: string;
};

export type ApproveCancellationResult = {
  requestId: string;
  orderId: string;
  status: CancellationRequestStatus;
  attemptId: string;
  orderCancellationId: string | null;
  gemnEstornado: number;
  cashbackRetirado: number;
  cashbackDividaCriada: number;
  cashbackDividaRestaurada: number;
  erroCodigo: string | null;
  erroMensagem: string | null;
};

export type RejectCancellationResult = {
  requestId: string;
  orderId: string;
  status: Extract<CancellationRequestStatus, 'rejeitada'>;
  attemptId: string;
  motivoDecisao: string;
};

export type RequestCancellationParams = {
  orderId: string;
  idempotencyKey: string;
  motivo: string;
};

export type DecideCancellationParams = {
  requestId: string;
  idempotencyKey: string;
};

export type RejectCancellationParams = DecideCancellationParams & {
  motivo: string;
};

export class CancellationRequestServiceError extends Error {
  readonly kind: CancellationServiceErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    kind: CancellationServiceErrorKind,
    message: string,
    code?: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'CancellationRequestServiceError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}
