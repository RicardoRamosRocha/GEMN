import type { SellerCancellationRequestQuery, SellerRelatedOrder } from '../types/cancellationRequestQueries';

const syntheticSellerId = '00000000-0000-4000-8000-000000000002';
const createdAt = '2026-01-15T12:00:00.000Z';

function fixtureOrder(orderId: string, itemName: string): SellerRelatedOrder {
  return {
    orderId,
    orderStatus: 'confirmado',
    formaPagamento: 'real',
    totalReal: 125,
    totalGemn: null,
    gemnUtilizado: 0,
    valorDevidoReal: 125,
    orderCriadoEm: createdAt,
    itemId: `${orderId}-item`,
    listingId: `${orderId}-listing`,
    sellerId: syntheticSellerId,
    nomeItem: itemName,
    tipo: 'produto',
    quantidade: 1,
    subtotalReal: 125,
    subtotalGemn: null,
    cashbackPercentual: 5,
    cashbackPrevisto: 6.25,
    itemCriadoEm: createdAt,
  };
}
export const sellerOrdersUiFixtures: SellerRelatedOrder[] = [
  fixtureOrder('00000000-0000-4000-8000-000000000201', 'Pedido confirmado disponível'),
  fixtureOrder('00000000-0000-4000-8000-000000000202', 'Solicitação pendente'),
  fixtureOrder('00000000-0000-4000-8000-000000000203', 'Solicitação aprovada'),
  fixtureOrder('00000000-0000-4000-8000-000000000204', 'Solicitação rejeitada'),
  fixtureOrder('00000000-0000-4000-8000-000000000205', 'Execução administrativa falhou'),
];

function request(orderId: string, status: SellerCancellationRequestQuery['status'], motivoDecisao: string | null = null): SellerCancellationRequestQuery {
  return {
    requestId: `${orderId}-request`,
    orderId,
    requesterRole: 'comprador',
    motivoSolicitacao: 'Motivo sintético para demonstração visual.',
    status,
    motivoDecisao,
    orderStatus: 'confirmado',
    criadoEm: createdAt,
    atualizadoEm: createdAt,
    decididoEm: status === 'pendente' ? null : createdAt,
  };
}

export const sellerCancellationUiFixtures: SellerCancellationRequestQuery[] = [
  request(sellerOrdersUiFixtures[1].orderId, 'pendente'),
  request(sellerOrdersUiFixtures[2].orderId, 'aprovada'),
  request(sellerOrdersUiFixtures[3].orderId, 'rejeitada', 'Motivo sintético rejeitado para demonstração.'),
  request(sellerOrdersUiFixtures[4].orderId, 'execucao_falhou'),
];

export function sellerFixtureRequestsByOrder() {
  return sellerCancellationUiFixtures.reduce<Record<string, SellerCancellationRequestQuery>>((result, requestItem) => {
    result[requestItem.orderId] = requestItem;
    return result;
  }, {});
}

export function createSellerFixtureCancellationRequest(orderId: string, motivo: string): SellerCancellationRequestQuery {
  const now = new Date().toISOString();
  return {
    requestId: `${orderId}-local-request`,
    orderId,
    requesterRole: 'vendedor',
    motivoSolicitacao: motivo,
    status: 'pendente',
    motivoDecisao: null,
    orderStatus: 'confirmado',
    criadoEm: now,
    atualizadoEm: now,
    decididoEm: null,
  };
}
