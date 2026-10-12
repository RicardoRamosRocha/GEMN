export type SellerDashboardFixture = {
  seller: {
    id: string;
    nomeNegocio: string;
    descricao: string;
    telefone: string;
    status: 'ativo' | 'suspenso';
    aceitaGemn: boolean;
  };
  listingsCount: number;
  ordersCount: number;
  confirmedOrdersCount: number;
  cashbackPercentual: number;
};

export const sellerDashboardUiFixture: SellerDashboardFixture = {
  seller: {
    id: '00000000-0000-4000-8000-000000000002',
    nomeNegocio: 'Loja demonstrativa GEMN',
    descricao: 'Dados locais para validação visual do painel do vendedor.',
    telefone: '(00) 00000-0000',
    status: 'ativo',
    aceitaGemn: true,
  },
  listingsCount: 3,
  ordersCount: 5,
  confirmedOrdersCount: 2,
  cashbackPercentual: 5,
};
