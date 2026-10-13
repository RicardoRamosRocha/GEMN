import { __walletTestables } from './wallet';
import type { Wallet, WalletTransaction } from '../types/wallet';

const wallet: Wallet = __walletTestables.normalizeWallet({ id: 'wallet-id', user_id: 'user-id', saldo_disponivel: '25.50', saldo_reservado: '4.50', saldo_a_recuperar: '0.00', versao: '2', criado_em: '2026-01-01T00:00:00Z', atualizado_em: '2026-01-02T00:00:00Z' });
if (wallet.saldoDisponivel !== 25.5 || wallet.saldoReservado !== 4.5) throw new Error('wallet balances were not normalized');
const transaction: WalletTransaction = __walletTestables.normalizeTransaction({ id: 'transaction-id', wallet_id: 'wallet-id', order_id: null, cashback_lot_id: null, tipo: 'reserva_gemn', valor: '4.50', saldo_disponivel_apos: '25.50', saldo_reservado_apos: '4.50', saldo_a_recuperar_apos: '0.00', seller_origem_id: null, seller_recebedor_id: 'seller-id', descricao: 'Reserva GEMN de pedido pendente', executado_por: null, criado_em: '2026-01-02T00:00:00Z' });
if (transaction.tipo !== 'reserva_gemn' || transaction.valor !== 4.5 || transaction.walletId !== wallet.id) throw new Error('wallet transaction was not normalized');
void wallet;
void transaction;
