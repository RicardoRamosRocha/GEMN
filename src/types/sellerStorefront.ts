export type SellerStorefrontErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'not_found'
  | 'unavailable'
  | 'network'
  | 'unexpected';

export type SellerStorefrontSeller = {
  id: string;
  nomeNegocio: string;
  descricao: string;
  status: 'ativo';
  aceitaGemn: boolean;
  logoUrl?: string;
  bannerUrl?: string;
};

export type SellerStorefrontListing = {
  id: string;
  sellerId: string;
  type: 'Produto' | 'Serviço';
  name: string;
  description: string;
  categoryId: string;
  category: string;
  price: number;
  acceptsGemn: boolean;
  gemnValue?: number;
  imageUrl?: string;
};

export type SellerStorefront = {
  seller: SellerStorefrontSeller;
  listings: SellerStorefrontListing[];
};

export class SellerStorefrontServiceError extends Error {
  readonly kind: SellerStorefrontErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    kind: SellerStorefrontErrorKind,
    message: string,
    code?: string,
    retryable = false,
  ) {
    super(message);
    this.name = 'SellerStorefrontServiceError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}
