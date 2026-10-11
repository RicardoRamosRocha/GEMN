import type { CancellationRequestStatus, CancellationRequesterRole } from './cancellationRequests';

export type CancellationRequestQuery = {
  requestId: string;
  orderId: string;
  requestedBy: string;
  requesterRole: CancellationRequesterRole;
  requesterSellerId: string | null;
  motivoSolicitacao: string;
  status: CancellationRequestStatus;
  decisionIdempotencyKey?: string | null;
  decidedBy: string | null;
  motivoDecisao: string | null;
  orderCancellationId: string | null;
  erroCodigo: string | null;
  erroMensagem: string | null;
  orderStatus: string;
  totalReal: number;
  gemnUtilizado: number;
  valorDevidoReal: number;
  orderCriadoEm?: string;
  criadoEm: string;
  atualizadoEm: string;
  decididoEm: string | null;
};

export type SellerRelatedOrder = {
  orderId: string;
  orderStatus: string;
  formaPagamento: string;
  totalReal: number;
  totalGemn: number | null;
  gemnUtilizado: number;
  valorDevidoReal: number;
  orderCriadoEm: string;
  itemId: string;
  listingId: string;
  sellerId: string;
  nomeItem: string;
  tipo: string;
  quantidade: number;
  subtotalReal: number;
  subtotalGemn: number | null;
  cashbackPercentual: number;
  cashbackPrevisto: number;
  itemCriadoEm: string;
};

export type CancellationRequestAttempt = {
  attemptId: string;
  requestId: string;
  operacao: string;
  resultado: string;
  orderCancellationId: string | null;
  erroCodigo: string | null;
  erroMensagem: string | null;
  criadoEm: string;
  finalizadoEm: string;
};
