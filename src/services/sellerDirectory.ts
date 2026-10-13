import { supabase } from '../lib/supabase';
import { getSellerDirectoryLogoUrls } from './sellerBranding';
import {
  SellerDirectoryServiceError,
  type SellerDirectoryPage,
  type SellerDirectorySearchParams,
  type SellerDirectoryStore,
} from '../types/sellerDirectory';

export { SellerDirectoryServiceError } from '../types/sellerDirectory';

export const SELLER_DIRECTORY_SELECT = 'id,nome_negocio,descricao,status' as const;
export const SELLER_DIRECTORY_DEFAULT_PAGE_SIZE = 12 as const;
export const SELLER_DIRECTORY_MAX_PAGE_SIZE = 50 as const;

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

function normalizeError(error: unknown): SellerDirectoryServiceError {
  if (error instanceof SellerDirectoryServiceError) return error;
  const message = errorMessage(error);
  const code = errorCode(error);

  if (code === 'PGRST301' || code === '401' || message.includes('not authenticated') || message.includes('jwt') && message.includes('expired')) {
    return new SellerDirectoryServiceError('auth', 'É necessário estar autenticado para consultar as lojas.', { code });
  }
  if (code === '403' || code === '42501' || message.includes('permission denied') || message.includes('not authorized') || message.includes('row-level security')) {
    return new SellerDirectoryServiceError('authorization', 'Você não tem autorização para consultar as lojas.', { code });
  }
  if (code === '42703' || code === '42P01' || code === 'PGRST204' || code === 'PGRST205' || message.includes('column') && message.includes('does not exist') || message.includes('relation') && message.includes('does not exist')) {
    return new SellerDirectoryServiceError('schema', 'A descoberta de lojas ainda não está disponível neste banco.', { code });
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new SellerDirectoryServiceError('network', 'Não foi possível conectar ao GEMN. Tente novamente.', { code, retryable: true });
  }
  return new SellerDirectoryServiceError('unexpected', 'Não foi possível carregar as lojas. Tente novamente.', { code });
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SellerDirectoryServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function normalizeParams(params: SellerDirectorySearchParams = {}) {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? SELLER_DIRECTORY_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(page) || page < 1) {
    throw new SellerDirectoryServiceError('validation', 'A página solicitada é inválida.');
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > SELLER_DIRECTORY_MAX_PAGE_SIZE) {
    throw new SellerDirectoryServiceError('validation', 'O tamanho da página solicitada é inválido.');
  }
  return {
    search: typeof params.search === 'string' ? params.search.trim() : '',
    page,
    pageSize,
  };
}

// Escapa caracteres que possuem significado no parser do operador `or` do
// PostgREST e caracteres curinga do ILIKE. Os curingas externos continuam
// sendo adicionados pelo serviço para a busca parcial.
function escapeSearchValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/([,*()%_])/g, '\\$1');
}

function buildSearchFilter(search: string): string | null {
  const normalized = search.trim();
  if (!normalized) return null;
  const escaped = escapeSearchValue(normalized);
  return `nome_negocio.ilike.*${escaped}*,descricao.ilike.*${escaped}*`;
}

function mapSellerDirectoryRow(row: unknown): SellerDirectoryStore | null {
  if (!isRecord(row)) throw new SellerDirectoryServiceError('unexpected', 'A resposta de lojas possui formato inválido.');
  if (row.status !== 'ativo') return null;
  const id = requiredText(row.id, 'id');
  if (!validUuid(id)) throw new SellerDirectoryServiceError('unexpected', 'Retorno inválido: id da loja.');
  return {
    id,
    storeName: requiredText(row.nome_negocio, 'nome_negocio'),
    description: requiredText(row.descricao, 'descricao'),
    status: 'ativo',
    logoUrl: null,
  };
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new SellerDirectoryServiceError('auth', 'É necessário estar autenticado para consultar as lojas.');
  return data.user;
}

export async function listActiveSellerDirectory(params: SellerDirectorySearchParams = {}): Promise<SellerDirectoryPage> {
  const normalized = normalizeParams(params);
  await requireAuthenticatedUser();

  let query = supabase
    .from('sellers')
    .select(SELLER_DIRECTORY_SELECT, { count: 'exact' })
    .eq('status', 'ativo')
    .order('nome_negocio', { ascending: true })
    .order('id', { ascending: true });

  const searchFilter = buildSearchFilter(normalized.search);
  if (searchFilter) query = query.or(searchFilter);

  const from = (normalized.page - 1) * normalized.pageSize;
  const to = from + normalized.pageSize - 1;
  const { data, error, count } = await query.range(from, to);
  if (error) throw normalizeError(error);
  if (!Array.isArray(data)) throw new SellerDirectoryServiceError('unexpected', 'A consulta de lojas retornou um formato inválido.');

  const items = data
    .map(mapSellerDirectoryRow)
    .filter((item): item is SellerDirectoryStore => item !== null);
  const logoUrls = await getSellerDirectoryLogoUrls(items.map((item) => item.id));
  const brandedItems = items.map((item) => ({ ...item, logoUrl: logoUrls.get(item.id) ?? null }));
  const total = typeof count === 'number' ? count : null;
  return {
    items: brandedItems,
    page: normalized.page,
    pageSize: normalized.pageSize,
    hasMore: total === null ? data.length === normalized.pageSize : from + items.length < total,
    total,
  };
}

export const __sellerDirectoryTestables = {
  buildSearchFilter,
  escapeSearchValue,
  mapSellerDirectoryRow,
  normalizeError,
  normalizeParams,
};
