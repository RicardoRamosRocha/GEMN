export type OrderStatus =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado'
  | 'expirado';

export type PaymentMethod = 'real' | 'gemn' | 'misto';

export type CreateOrderParams = {
  listingId: string;
  quantidade: number;
  formaPagamento: PaymentMethod;
  gemnUtilizado: number;
  idempotencyKey: string;
};

export type OrderRpcResult = {
  orderId: string;
  status: OrderStatus;
  formaPagamento: PaymentMethod;
  quantidade: number;
  totalReal: number;
  totalGemn: number | null;
  gemnUtilizado: number;
  valorDevidoReal: number;
  cashbackPercentual: number;
  cashbackPrevisto: number;
};

export type OrderItem = {
  id: string;
  orderId: string;
  listingId: string;
  sellerId: string;
  nomeItem: string;
  tipo: 'produto' | 'servico';
  quantidade: number;
  precoRealUnitario: number;
  precoGemnUnitario: number | null;
  subtotalReal: number;
  subtotalGemn: number | null;
  cashbackPercentual: number;
  cashbackPrevisto: number;
  imagemPrincipalSnapshot: string | null;
  imagemPrincipalUrl?: string;
  criadoEm: string;
  atualizadoEm: string;
};

export type Order = {
  id: string;
  status: OrderStatus;
  formaPagamento: PaymentMethod;
  totalReal: number;
  totalGemn: number | null;
  gemnUtilizado: number;
  valorDevidoReal: number;
  criadoEm: string;
  atualizadoEm: string;
  items: OrderItem[];
};
