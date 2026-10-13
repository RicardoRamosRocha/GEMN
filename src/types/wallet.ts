export type Wallet = {
  id: string;
  userId: string;
  saldoDisponivel: number;
  saldoReservado: number;
  saldoARecuperar: number;
  versao: number;
  criadoEm: string;
  atualizadoEm: string;
};

export type WalletTransactionType =
  | 'cashback_credito'
  | 'reserva_gemn'
  | 'liberacao_reserva'
  | 'debito_gemn'
  | 'credito_venda_gemn'
  | 'estorno_gemn'
  | 'estorno_cashback'
  | 'cashback_divida_criada'
  | 'cashback_recuperacao'
  | 'ajuste_administrativo'
  | 'compensacao_simulada';

export type WalletTransaction = {
  id: string;
  walletId: string;
  orderId: string | null;
  cashbackLotId: string | null;
  tipo: WalletTransactionType;
  valor: number;
  saldoDisponivelApos: number;
  saldoReservadoApos: number;
  saldoARecuperarApos: number;
  sellerOrigemId: string | null;
  sellerRecebedorId: string | null;
  descricao: string;
  executadoPor: string | null;
  criadoEm: string;
};

export type WalletData = { wallet: Wallet | null; transactions: WalletTransaction[] };
