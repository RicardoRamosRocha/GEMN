export type SellerDirectoryStore = {
  id: string;
  storeName: string;
  description: string;
  status: 'ativo';
  logoUrl: string | null;
};

export type SellerDirectorySearchParams = {
  search?: string;
  page?: number;
  pageSize?: number;
};

export type SellerDirectoryPage = {
  items: SellerDirectoryStore[];
  page: number;
  pageSize: number;
  hasMore: boolean;
  total: number | null;
};

export type SellerDirectoryErrorKind =
  | 'auth'
  | 'authorization'
  | 'validation'
  | 'network'
  | 'schema'
  | 'unexpected';

export class SellerDirectoryServiceError extends Error {
  readonly kind: SellerDirectoryErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(
    kind: SellerDirectoryErrorKind,
    message: string,
    options: { code?: string; retryable?: boolean } = {},
  ) {
    super(message);
    this.name = 'SellerDirectoryServiceError';
    this.kind = kind;
    this.code = options.code;
    this.retryable = options.retryable ?? false;
  }
}
