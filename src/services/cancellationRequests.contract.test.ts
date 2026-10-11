import type {
  ApproveCancellationResult,
  CancellationRequestResult,
  RejectCancellationResult,
} from '../types/cancellationRequests';

// Teste de contrato compilável: mantém os campos retornados pelas três RPCs
// alinhados com os tipos consumidos pelo aplicativo. O runner do projeto não
// possui infraestrutura Jest/Vitest; a execução é coberta pelo tsc.
const requestResult: CancellationRequestResult = {
  requestId: 'request-id',
  orderId: 'order-id',
  status: 'pendente',
  requesterRole: 'comprador',
  requesterSellerId: null,
  motivoSolicitacao: 'motivo',
  criadoEm: new Date().toISOString(),
};

const approvalResult: ApproveCancellationResult = {
  requestId: requestResult.requestId,
  orderId: requestResult.orderId,
  status: 'aprovada',
  attemptId: 'attempt-id',
  orderCancellationId: 'cancellation-id',
  gemnEstornado: 0,
  cashbackRetirado: 0,
  cashbackDividaCriada: 0,
  cashbackDividaRestaurada: 0,
  erroCodigo: null,
  erroMensagem: null,
};

const rejectionResult: RejectCancellationResult = {
  requestId: requestResult.requestId,
  orderId: requestResult.orderId,
  status: 'rejeitada',
  attemptId: 'attempt-id',
  motivoDecisao: 'motivo da decisão',
};

void approvalResult;
void rejectionResult;
