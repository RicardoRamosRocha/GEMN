import { randomUUID } from 'expo-crypto';

import { supabase } from '../lib/supabase';
import {
  SellerSettingsServiceError,
  type SellerCashbackRule,
  type SellerGemnAcceptanceResult,
  type SellerSettings,
  type UpdateCashbackParams,
} from '../types/sellerSettings';

export { SellerSettingsServiceError } from '../types/sellerSettings';

export const SELLER_GEMN_ACCEPTANCE_RPC = 'set_seller_gemn_acceptance' as const;
export const SELLER_CASHBACK_RPC = 'set_seller_cashback' as const;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.toLowerCase();
  if (isRecord(error) && typeof error.message === 'string') return error.message.toLowerCase();
  return String(error).toLowerCase();
}

function errorCode(error: unknown): string | undefined {
  return isRecord(error) && typeof error.code === 'string' ? error.code : undefined;
}

function rawErrorMessage(error: unknown): string | undefined {
  return isRecord(error) && typeof error.message === 'string' ? error.message : undefined;
}

function normalizeError(error: unknown): SellerSettingsServiceError {
  const message = errorMessage(error);
  const code = errorCode(error);
  const raw = rawErrorMessage(error);

  if (
    code === 'PGRST301' ||
    code === '401' ||
    code === '42501' ||
    message.includes('not authenticated') ||
    message.includes('autenticado é obrigatório') ||
    message.includes('autenticado e obrigatorio') ||
    message.includes('jwt') && message.includes('expired')
  ) {
    return new SellerSettingsServiceError('auth', 'É necessário estar autenticado para acessar esta operação.', code);
  }

  if (
    code === '403' ||
    message.includes('permission denied') ||
    message.includes('não autorizado') ||
    message.includes('nao autorizado') ||
    message.includes('não possui vendedor') ||
    message.includes('nao possui vendedor') ||
    message.includes('vendedor suspenso')
  ) {
    return new SellerSettingsServiceError('authorization', raw ?? 'Você não tem autorização para alterar estas configurações.', code);
  }

  if (
    code === '409' ||
    code === '23505' ||
    message.includes('conflito') ||
    message.includes('conflict') ||
    message.includes('duplicate')
  ) {
    return new SellerSettingsServiceError('conflict', raw ?? 'A configuração entrou em conflito com outra operação.', code);
  }

  if (
    code === 'P0001' && (
      message.includes('percentual') ||
      message.includes('aceitação') ||
      message.includes('aceitacao') ||
      message.includes('idempotency_key') ||
      message.includes('obrigat')
    )
  ) {
    return new SellerSettingsServiceError('validation', raw ?? 'Revise os dados informados.', code);
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new SellerSettingsServiceError(
      'network',
      'Não foi possível conectar ao GEMN. A operação pode ter sido concluída; consulte a configuração antes de repetir.',
      code,
      true,
    );
  }

  return new SellerSettingsServiceError('unexpected', 'Não foi possível concluir a operação de configurações.', code);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SellerSettingsServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null;
  return requiredString(value, field);
}

function finiteNumber(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) {
    throw new SellerSettingsServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  }
  return result;
}

function singleRow(data: unknown): UnknownRecord {
  if (!Array.isArray(data) || data.length !== 1 || !isRecord(data[0])) {
    throw new SellerSettingsServiceError('unexpected', 'A RPC retornou um formato inesperado.');
  }
  return data[0];
}

function sellerGemnAcceptanceFromRpc(data: unknown): SellerGemnAcceptanceResult {
  const row = singleRow(data);
  return {
    sellerId: requiredString(row.seller_id, 'seller_id'),
    aceitaGemn: row.aceita_gemn === true || row.aceita_gemn === false
      ? row.aceita_gemn
      : (() => { throw new SellerSettingsServiceError('unexpected', 'Retorno inválido: aceita_gemn ausente.'); })(),
  };
}

function cashbackRuleFromRpc(data: unknown): SellerCashbackRule {
  const row = singleRow(data);
  return {
    ruleId: requiredString(row.rule_id, 'rule_id'),
    sellerId: requiredString(row.seller_id, 'seller_id'),
    percentual: finiteNumber(row.percentual, 'percentual'),
    vigenteDesde: requiredString(row.vigente_desde, 'vigente_desde'),
    vigenteAte: nullableString(row.vigente_ate, 'vigente_ate'),
  };
}

export function validateCashbackPercentual(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SellerSettingsServiceError('validation', 'Informe um percentual de cashback válido.');
  }
  if (value < 0 || value > 20) {
    throw new SellerSettingsServiceError('validation', 'O percentual de cashback deve estar entre 0% e 20%.');
  }
  if (Math.round(value * 100) !== value * 100) {
    throw new SellerSettingsServiceError('validation', 'O percentual de cashback deve possuir no máximo duas casas decimais.');
  }
  return value;
}

export function createCashbackIdempotencyKey(): string {
  return randomUUID();
}

async function requireAuthenticatedUser(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new SellerSettingsServiceError('auth', 'É necessário estar autenticado para acessar esta operação.');
  return data.user.id;
}

export async function getCurrentSellerSettings(): Promise<SellerSettings> {
  const userId = await requireAuthenticatedUser();
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select('id,nome_negocio,status,aceita_gemn')
    .eq('user_id', userId)
    .maybeSingle();

  if (sellerError) throw normalizeError(sellerError);
  if (
    !seller ||
    typeof seller.id !== 'string' ||
    typeof seller.nome_negocio !== 'string' ||
    (seller.status !== 'ativo' && seller.status !== 'suspenso') ||
    (seller.aceita_gemn !== true && seller.aceita_gemn !== false)
  ) {
    throw new SellerSettingsServiceError('authorization', 'O usuário autenticado não possui um vendedor configurado.');
  }

  const { data: cashback, error: cashbackError } = await supabase
    .from('cashback_rules')
    .select('percentual')
    .eq('seller_id', seller.id)
    .is('vigente_ate', null)
    .maybeSingle();

  if (cashbackError) throw normalizeError(cashbackError);

  return {
    sellerId: seller.id,
    storeName: seller.nome_negocio,
    status: seller.status,
    aceitaGemn: seller.aceita_gemn,
    cashbackPercentual: cashback ? finiteNumber(cashback.percentual, 'percentual') : null,
  };
}

export async function updateSellerGemnAcceptance(aceitaGemn: boolean): Promise<SellerGemnAcceptanceResult> {
  await requireAuthenticatedUser();
  if (typeof aceitaGemn !== 'boolean') {
    throw new SellerSettingsServiceError('validation', 'A aceitação de GEMN deve ser informada.');
  }

  const { data, error } = await supabase.rpc(SELLER_GEMN_ACCEPTANCE_RPC, {
    p_aceita_gemn: aceitaGemn,
  });
  if (error) throw normalizeError(error);
  return sellerGemnAcceptanceFromRpc(data);
}

export async function updateSellerCashback(params: UpdateCashbackParams): Promise<SellerCashbackRule> {
  const percentual = validateCashbackPercentual(params.percentual);
  await requireAuthenticatedUser();
  if (typeof params.idempotencyKey !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(params.idempotencyKey)) {
    throw new SellerSettingsServiceError('validation', 'A chave de idempotência deve ser um UUID válido.');
  }

  const { data, error } = await supabase.rpc(SELLER_CASHBACK_RPC, {
    p_percentual: percentual,
    p_idempotency_key: params.idempotencyKey,
  });
  if (error) throw normalizeError(error);
  return cashbackRuleFromRpc(data);
}

export const __sellerSettingsTestables = {
  normalizeError,
  sellerGemnAcceptanceFromRpc,
  cashbackRuleFromRpc,
};
