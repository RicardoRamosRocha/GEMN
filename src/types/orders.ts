export type OrderStatus =
  | 'pendente'
  | 'confirmado'
  | 'concluido'
  | 'cancelado';

export type PaymentMethod = 'real' | 'gemn';

export type CreateOrderParams = {
  listingId: string;
  quantidade: number;
  formaPagamento: PaymentMethod;
  idempotencyKey: string;
};

export type OrderRpcResult = {
  orderId: string;
  status: OrderStatus;
  formaPagamento: PaymentMethod;
  quantidade: number;
  totalReal: number;
  totalGemn: number | null;
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
  criadoEm: string;
  atualizadoEm: string;
};

export type Order = {
  id: string;
  status: OrderStatus;
  formaPagamento: PaymentMethod;
  totalReal: number;
  totalGemn: number | null;
  criadoEm: string;
  atualizadoEm: string;
  items: OrderItem[];
};
