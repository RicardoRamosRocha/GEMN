export type SellerBrandingErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'not_found'
  | 'unavailable'
  | 'network'
  | 'unexpected';

export type SellerBrandingImageKind = 'logo' | 'banner';

export type SellerBranding = {
  sellerId: string;
  logoPath: string | null;
  bannerPath: string | null;
  logoUrl?: string;
  bannerUrl?: string;
  atualizadoEm: string;
};

export type SellerBrandingStore = {
  sellerId: string;
  storeName: string;
  description: string;
  status: 'ativo' | 'suspenso';
  branding: SellerBranding;
};

export type SellerBrandingImage = {
  uri: string;
  fileName?: string | null;
  fileSize?: number;
  mimeType?: string | null;
  file?: Blob;
};

export type SellerBrandingUpdate = {
  logo?: SellerBrandingImage | null;
  banner?: SellerBrandingImage | null;
};

export type SellerProfile = {
  sellerId: string;
  storeName: string;
  description: string;
  atualizadoEm: string;
};

export type SellerProfileUpdate = {
  storeName: string;
  description?: string | null;
};

export type SellerBrandingUpdateResult = {
  store: SellerBrandingStore;
  cleanupPending: string[];
};

export class SellerBrandingServiceError extends Error {
  readonly kind: SellerBrandingErrorKind;
  readonly code?: string;
  readonly retryable: boolean;
  readonly responseUnknown: boolean;
  readonly cleanupPending: string[];

  constructor(
    kind: SellerBrandingErrorKind,
    message: string,
    options: {
      code?: string;
      retryable?: boolean;
      responseUnknown?: boolean;
      cleanupPending?: string[];
    } = {},
  ) {
    super(message);
    this.name = 'SellerBrandingServiceError';
    this.kind = kind;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
    this.responseUnknown = options.responseUnknown ?? false;
    this.cleanupPending = options.cleanupPending ?? [];
  }
}
