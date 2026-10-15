import type { Order } from '../types/orders';
import type { CancellationRequestQuery } from '../types/cancellationRequestQueries';

const syntheticBuyerId = '00000000-0000-4000-8000-000000000001';
const syntheticSellerId = '00000000-0000-4000-8000-000000000002';
const createdAt = '2026-01-15T12:00:00.000Z';

function fixtureOrder(id: string, itemName: string): Order {
  return {
    id,
    status: 'confirmado',
    formaPagamento: 'real',
    totalReal: 125,
    totalGemn: null,
    gemnUtilizado: 0,
    valorDevidoReal: 125,
    criadoEm: createdAt,
    atualizadoEm: createdAt,
    items: [{
      id: `${id}-item`,
      orderId: id,
      listingId: `${id}-listing`,
      sellerId: syntheticSellerId,
      nomeItem: itemName,
      tipo: 'produto',
      quantidade: 1,
      precoRealUnitario: 125,
      precoGemnUnitario: null,
      subtotalReal: 125,
      subtotalGemn: null,
      cashbackPercentual: 5,
      cashbackPrevisto: 6.25,
      imagemPrincipalSnapshot: null,
      criadoEm: createdAt,
      atualizadoEm: createdAt,
    }],
  };
}

export const ordersUiFixtures: Order[] = [
  fixtureOrder('00000000-0000-4000-8000-000000000101', 'Pedido confirmado disponível'),
  fixtureOrder('00000000-0000-4000-8000-000000000102', 'Solicitação pendente'),
  fixtureOrder('00000000-0000-4000-8000-000000000103', 'Solicitação aprovada'),
  fixtureOrder('00000000-0000-4000-8000-000000000104', 'Solicitação rejeitada'),
  fixtureOrder('00000000-0000-4000-8000-000000000105', 'Execução administrativa falhou'),
];

function request(orderId: string, status: CancellationRequestQuery['status'], motivoDecisao: string | null = null): CancellationRequestQuery {
  return {
    requestId: `${orderId}-request`,
    orderId,
    requestedBy: syntheticBuyerId,
    requesterRole: 'comprador',
    requesterSellerId: null,
    motivoSolicitacao: 'Motivo sintético para demonstração visual.',
    status,
    decisionIdempotencyKey: status === 'pendente' ? null : `${orderId}-decision`,
    decidedBy: status === 'pendente' ? null : '00000000-0000-4000-8000-000000000003',
    motivoDecisao,
    orderCancellationId: status === 'aprovada' ? `${orderId}-cancellation` : null,
    erroCodigo: status === 'execucao_falhou' ? 'SIMULATED_FAILURE' : null,
    erroMensagem: status === 'execucao_falhou' ? 'Falha administrativa sintética.' : null,
    orderStatus: 'confirmado',
    totalReal: 125,
    gemnUtilizado: 0,
    valorDevidoReal: 125,
    orderCriadoEm: createdAt,
    criadoEm: createdAt,
    atualizadoEm: createdAt,
    decididoEm: status === 'pendente' ? null : createdAt,
  };
}

export const cancellationUiFixtures: CancellationRequestQuery[] = [
  request(ordersUiFixtures[1].id, 'pendente'),
  request(ordersUiFixtures[2].id, 'aprovada'),
  request(ordersUiFixtures[3].id, 'rejeitada', 'O motivo apresentado não atende aos critérios da demonstração.'),
  request(ordersUiFixtures[4].id, 'execucao_falhou'),
];

export function isGemnUiFixturesEnabled() {
  return __DEV__ === true && process.env.EXPO_PUBLIC_GEMN_UI_FIXTURES === 'true';
}

export function fixtureRequestsByOrder() {
  return cancellationUiFixtures.reduce<Record<string, CancellationRequestQuery>>((result, requestItem) => {
    result[requestItem.orderId] = requestItem;
    return result;
  }, {});
}

export function createFixtureCancellationRequest(orderId: string, motivo: string): CancellationRequestQuery {
  const now = new Date().toISOString();
  return {
    requestId: `${orderId}-local-request`,
    orderId,
    requestedBy: syntheticBuyerId,
    requesterRole: 'comprador',
    requesterSellerId: null,
    motivoSolicitacao: motivo,
    status: 'pendente',
    decisionIdempotencyKey: null,
    decidedBy: null,
    motivoDecisao: null,
    orderCancellationId: null,
    erroCodigo: null,
    erroMensagem: null,
    orderStatus: 'confirmado',
    totalReal: 125,
    gemnUtilizado: 0,
    valorDevidoReal: 125,
    orderCriadoEm: createdAt,
    criadoEm: now,
    atualizadoEm: now,
    decididoEm: null,
  };
}
