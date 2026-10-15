import { supabase } from '../lib/supabase';
import type { Wallet, WalletData, WalletTransaction, WalletTransactionType } from '../types/wallet';

type UnknownRecord = Record<string, unknown>;
export class WalletServiceError extends Error { readonly kind: 'auth' | 'network' | 'unexpected'; constructor(kind: WalletServiceError['kind'], message: string) { super(message); this.name = 'WalletServiceError'; this.kind = kind; } }
const WALLET_SELECT = 'id,user_id,saldo_disponivel,saldo_reservado,saldo_a_recuperar,versao,criado_em,atualizado_em';
const TRANSACTION_SELECT = 'id,wallet_id,order_id,cashback_lot_id,tipo,valor,saldo_disponivel_apos,saldo_reservado_apos,saldo_a_recuperar_apos,seller_origem_id,seller_recebedor_id,descricao,executado_por,criado_em';
const TRANSACTION_TYPES: WalletTransactionType[] = ['cashback_credito', 'reserva_gemn', 'liberacao_reserva', 'debito_gemn', 'credito_venda_gemn', 'estorno_gemn', 'estorno_cashback', 'cashback_divida_criada', 'cashback_recuperacao', 'ajuste_administrativo', 'compensacao_simulada'];

function isRecord(value: unknown): value is UnknownRecord { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function requiredString(value: unknown, field: string): string { if (typeof value !== 'string' || value.trim() === '') throw new WalletServiceError('unexpected', `Retorno inválido: ${field} ausente.`); return value; }
function nullableString(value: unknown, field: string): string | null { return value === null || value === undefined ? null : requiredString(value, field); }
function numberValue(value: unknown, field: string): number { const number = typeof value === 'number' ? value : Number(value); if (!Number.isFinite(number)) throw new WalletServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`); return number; }

function normalizeWallet(value: unknown): Wallet {
  if (!isRecord(value)) throw new WalletServiceError('unexpected', 'Retorno inválido: carteira ausente.');
  return { id: requiredString(value.id, 'id'), userId: requiredString(value.user_id, 'user_id'), saldoDisponivel: numberValue(value.saldo_disponivel, 'saldo_disponivel'), saldoReservado: numberValue(value.saldo_reservado, 'saldo_reservado'), saldoARecuperar: numberValue(value.saldo_a_recuperar, 'saldo_a_recuperar'), versao: numberValue(value.versao, 'versao'), criadoEm: requiredString(value.criado_em, 'criado_em'), atualizadoEm: requiredString(value.atualizado_em, 'atualizado_em') };
}
function normalizeTransaction(value: unknown): WalletTransaction {
  if (!isRecord(value)) throw new WalletServiceError('unexpected', 'Retorno inválido: movimentação ausente.');
  if (!TRANSACTION_TYPES.includes(value.tipo as WalletTransactionType)) throw new WalletServiceError('unexpected', 'Retorno inválido: tipo de movimentação desconhecido.');
  return { id: requiredString(value.id, 'id'), walletId: requiredString(value.wallet_id, 'wallet_id'), orderId: nullableString(value.order_id, 'order_id'), cashbackLotId: nullableString(value.cashback_lot_id, 'cashback_lot_id'), tipo: value.tipo as WalletTransactionType, valor: numberValue(value.valor, 'valor'), saldoDisponivelApos: numberValue(value.saldo_disponivel_apos, 'saldo_disponivel_apos'), saldoReservadoApos: numberValue(value.saldo_reservado_apos, 'saldo_reservado_apos'), saldoARecuperarApos: numberValue(value.saldo_a_recuperar_apos, 'saldo_a_recuperar_apos'), sellerOrigemId: nullableString(value.seller_origem_id, 'seller_origem_id'), sellerRecebedorId: nullableString(value.seller_recebedor_id, 'seller_recebedor_id'), descricao: requiredString(value.descricao, 'descricao'), executadoPor: nullableString(value.executado_por, 'executado_por'), criadoEm: requiredString(value.criado_em, 'criado_em') };
}
function normalizeError(error: unknown): WalletServiceError { const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase(); if (message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) return new WalletServiceError('auth', 'É necessário estar autenticado para consultar sua carteira.'); if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) return new WalletServiceError('network', 'Não foi possível consultar sua carteira. Verifique sua internet e tente novamente.'); return new WalletServiceError('unexpected', 'Não foi possível consultar sua carteira.'); }
async function authenticatedUser() { const { data, error } = await supabase.auth.getUser(); if (error) throw normalizeError(error); if (!data.user) throw new WalletServiceError('auth', 'É necessário estar autenticado para consultar sua carteira.'); return data.user; }

export async function getMyWallet(): Promise<WalletData> {
  const user = await authenticatedUser();
  const { error: bootstrapError } = await supabase.rpc('ensure_my_wallet');
  if (bootstrapError) throw normalizeError(bootstrapError);
  const { data: walletRow, error: walletError } = await supabase.from('wallets').select(WALLET_SELECT).eq('user_id', user.id).maybeSingle();
  if (walletError) throw normalizeError(walletError);
  if (!walletRow) return { wallet: null, transactions: [] };
  const wallet = normalizeWallet(walletRow);
  const { data: transactionRows, error: transactionError } = await supabase.from('wallet_transactions').select(TRANSACTION_SELECT).eq('wallet_id', wallet.id).order('criado_em', { ascending: false });
  if (transactionError) throw normalizeError(transactionError);
  if (!Array.isArray(transactionRows)) throw new WalletServiceError('unexpected', 'A consulta de movimentações retornou um formato inválido.');
  return { wallet, transactions: transactionRows.map(normalizeTransaction) };
}

export const __walletTestables = { normalizeWallet, normalizeTransaction, normalizeError };
