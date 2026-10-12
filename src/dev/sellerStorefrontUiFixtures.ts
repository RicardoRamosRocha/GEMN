import type { SellerStorefrontListing } from '../types/sellerStorefront';

export type SellerStorefrontFixtureScenario = 'active' | 'empty' | 'suspended' | 'error';

export type SellerStorefrontFixtureSeller = {
  id: string;
  nomeNegocio: string;
  descricao: string;
  status: 'ativo' | 'suspenso';
  aceitaGemn: boolean;
};

export type SellerStorefrontFixture = {
  seller: SellerStorefrontFixtureSeller;
  listings: SellerStorefrontListing[];
};

const sellerId = '00000000-0000-4000-8000-000000000002';
const categoryId = '00000000-0000-4000-8000-000000000003';

const listings: SellerStorefrontListing[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    sellerId,
    type: 'Produto',
    name: 'Cesta de frutas da estação',
    description: 'Seleção de frutas para a sua semana.',
    categoryId,
    category: 'Alimentos',
    price: 48.9,
    acceptsGemn: true,
    gemnValue: 24,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    sellerId,
    type: 'Serviço',
    name: 'Manutenção elétrica residencial',
    description: 'Atendimento agendado para pequenos reparos.',
    categoryId,
    category: 'Serviços',
    price: 120,
    acceptsGemn: false,
  },
];

export const sellerStorefrontUiFixtures: Record<Exclude<SellerStorefrontFixtureScenario, 'error'>, SellerStorefrontFixture> = {
  active: {
    seller: { id: sellerId, nomeNegocio: 'Loja demonstrativa GEMN', descricao: 'Produtos e serviços feitos por um empreendedor da comunidade.', status: 'ativo', aceitaGemn: true },
    listings,
  },
  empty: {
    seller: { id: sellerId, nomeNegocio: 'Loja sem anúncios', descricao: 'Este vendedor ainda está preparando sua vitrine.', status: 'ativo', aceitaGemn: false },
    listings: [],
  },
  suspended: {
    seller: { id: sellerId, nomeNegocio: 'Loja temporariamente indisponível', descricao: 'Esta vitrine não está disponível no momento.', status: 'suspenso', aceitaGemn: false },
    listings: [],
  },
};
