import type { SellerBrandingStore } from '../types/sellerBranding';

export type SellerBrandingUiFixtureScenario = 'active' | 'empty' | 'suspended' | 'load-error' | 'save-error' | 'partial-save';

export type SellerBrandingUiFixture = {
  scenario: SellerBrandingUiFixtureScenario;
  store: SellerBrandingStore;
  loadError?: string;
  saveError?: string;
};

const sellerId = '00000000-0000-4000-8000-000000000071';
const imageDataUri = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="640" height="240"%3E%3Crect width="100%25" height="100%25" fill="%23285b45"/%3E%3C/svg%3E';
const logoDataUri = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="160" height="160"%3E%3Ccircle cx="80" cy="80" r="72" fill="%23e9b44c"/%3E%3C/svg%3E';

function store(overrides: Partial<SellerBrandingStore> = {}): SellerBrandingStore {
  return {
    sellerId,
    storeName: 'Ateliê Aurora',
    description: 'Produtos autorais feitos com cuidado para a sua rotina.',
    status: 'ativo',
    branding: {
      sellerId,
      logoPath: `${sellerId}/logo/00000000-0000-4000-8000-000000000072.png`,
      bannerPath: `${sellerId}/banner/00000000-0000-4000-8000-000000000073.png`,
      logoUrl: logoDataUri,
      bannerUrl: imageDataUri,
      atualizadoEm: '2026-10-12T00:00:00.000Z',
    },
    ...overrides,
  };
}

export const sellerBrandingUiFixtures: Record<SellerBrandingUiFixtureScenario, SellerBrandingUiFixture> = {
  active: { scenario: 'active', store: store() },
  empty: {
    scenario: 'empty',
    store: store({ branding: { sellerId, logoPath: null, bannerPath: null, atualizadoEm: '2026-10-12T00:00:00.000Z' } }),
  },
  suspended: { scenario: 'suspended', store: store({ status: 'suspenso' }) },
  'load-error': { scenario: 'load-error', store: store(), loadError: 'Falha de carregamento simulada.' },
  'save-error': { scenario: 'save-error', store: store(), saveError: 'Falha de salvamento simulada.' },
  'partial-save': { scenario: 'partial-save', store: store(), saveError: 'Perfil salvo, mas as imagens ainda precisam de nova tentativa.' },
};

export function isSellerBrandingUiFixturesEnabled() {
  return __DEV__ === true && process.env.EXPO_PUBLIC_GEMN_UI_FIXTURES === 'true';
}

export function getSellerBrandingUiFixture(): SellerBrandingUiFixture {
  const scenario = process.env.EXPO_PUBLIC_GEMN_UI_FIXTURE_SCENARIO as SellerBrandingUiFixtureScenario | undefined;
  return sellerBrandingUiFixtures[scenario && scenario in sellerBrandingUiFixtures ? scenario : 'active'];
}
