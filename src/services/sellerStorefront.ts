import { supabase } from '../lib/supabase';
import {
  SellerStorefrontServiceError,
  type SellerStorefront,
  type SellerStorefrontListing,
  type SellerStorefrontSeller,
} from '../types/sellerStorefront';

export { SellerStorefrontServiceError } from '../types/sellerStorefront';

export const SELLER_STOREFRONT_SELLER_SELECT = 'id,nome_negocio,descricao,status,aceita_gemn' as const;
export const SELLER_STOREFRONT_LISTING_SELECT = 'id,seller_id,category_id,tipo,nome,descricao,preco_real,aceita_gemn,preco_gemn,imagem_principal,status,categories(id,nome,ativo)' as const;

type UnknownRecord = Record<string, unknown>;
type ListingRow = UnknownRecord & {
  categories?: UnknownRecord | UnknownRecord[] | null;
};

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

function normalizeError(error: unknown): SellerStorefrontServiceError {
  const message = errorMessage(error);
  const code = errorCode(error);
  const raw = rawErrorMessage(error);

  if (
    code === 'PGRST301' ||
    code === '401' ||
    message.includes('not authenticated') ||
    message.includes('autenticado') && message.includes('obrigat') ||
    message.includes('jwt') && message.includes('expired')
  ) {
    return new SellerStorefrontServiceError('auth', 'É necessário estar autenticado para consultar esta vitrine.', code);
  }

  if (code === '403' || code === '42501' || message.includes('permission denied') || message.includes('not authorized')) {
    return new SellerStorefrontServiceError('authorization', 'Você não tem autorização para consultar esta vitrine.', code);
  }

  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new SellerStorefrontServiceError(
      'network',
      'Não foi possível conectar ao GEMN. Tente novamente.',
      code,
      true,
    );
  }

  return new SellerStorefrontServiceError('unexpected', raw ?? 'Não foi possível carregar a vitrine do vendedor.', code);
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SellerStorefrontServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function finiteNumber(value: unknown, field: string): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new SellerStorefrontServiceError('unexpected', `Retorno inválido: ${field} não é numérico.`);
  }
  return numberValue;
}

function booleanValue(value: unknown, field: string): boolean {
  if (value !== true && value !== false) {
    throw new SellerStorefrontServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function categoryRow(row: ListingRow): UnknownRecord | null {
  const category = row.categories;
  if (Array.isArray(category)) return isRecord(category[0]) ? category[0] : null;
  return isRecord(category) ? category : null;
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function validateSellerId(sellerId: unknown): string {
  if (typeof sellerId !== 'string' || !validUuid(sellerId)) {
    throw new SellerStorefrontServiceError('validation', 'O identificador do vendedor é inválido.');
  }
  return sellerId;
}

function mapSeller(row: UnknownRecord): SellerStorefrontSeller {
  const status = row.status;
  if (status !== 'ativo') {
    throw new SellerStorefrontServiceError('unavailable', 'Esta vitrine não está disponível.');
  }
  return {
    id: requiredString(row.id, 'id'),
    nomeNegocio: requiredString(row.nome_negocio, 'nome_negocio'),
    descricao: requiredString(row.descricao, 'descricao'),
    status: 'ativo',
    aceitaGemn: booleanValue(row.aceita_gemn, 'aceita_gemn'),
  };
}

function mapListing(row: ListingRow, sellerId: string): SellerStorefrontListing | null {
  if (row.seller_id !== sellerId || row.status !== 'ativo') return null;
  const category = categoryRow(row);
  if (!category || category.ativo !== true) return null;
  const tipo = row.tipo;
  if (tipo !== 'produto' && tipo !== 'servico') {
    throw new SellerStorefrontServiceError('unexpected', 'Retorno inválido: tipo de anúncio desconhecido.');
  }
  const acceptsGemn = booleanValue(row.aceita_gemn, 'aceita_gemn');
  const precoGEMN = row.preco_gemn === null || row.preco_gemn === undefined
    ? undefined
    : finiteNumber(row.preco_gemn, 'preco_gemn');
  const imagePath = row.imagem_principal;
  if (imagePath !== null && imagePath !== undefined && typeof imagePath !== 'string') {
    throw new SellerStorefrontServiceError('unexpected', 'Retorno inválido: imagem_principal.');
  }
  return {
    id: requiredString(row.id, 'id'),
    sellerId: requiredString(row.seller_id, 'seller_id'),
    type: tipo === 'produto' ? 'Produto' : 'Serviço',
    name: requiredString(row.nome, 'nome'),
    description: requiredString(row.descricao, 'descricao'),
    categoryId: requiredString(row.category_id, 'category_id'),
    category: requiredString(category.nome, 'categories.nome'),
    price: finiteNumber(row.preco_real, 'preco_real'),
    acceptsGemn,
    ...(acceptsGemn && precoGEMN !== undefined ? { gemnValue: precoGEMN } : {}),
    ...(imagePath ? { imageUrl: supabase.storage.from('listing-images').getPublicUrl(imagePath).data.publicUrl } : {}),
  };
}

async function requireAuthenticatedUser(): Promise<void> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new SellerStorefrontServiceError('auth', 'É necessário estar autenticado para consultar esta vitrine.');
}

export async function getSellerStorefront(sellerId: string): Promise<SellerStorefront> {
  const validatedSellerId = validateSellerId(sellerId);
  await requireAuthenticatedUser();

  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select(SELLER_STOREFRONT_SELLER_SELECT)
    .eq('id', validatedSellerId)
    .maybeSingle();

  if (sellerError) throw normalizeError(sellerError);
  if (!seller) throw new SellerStorefrontServiceError('not_found', 'Vendedor não encontrado.');
  const mappedSeller = mapSeller(seller as UnknownRecord);

  const { data: listings, error: listingsError } = await supabase
    .from('listings')
    .select(SELLER_STOREFRONT_LISTING_SELECT)
    .eq('seller_id', validatedSellerId)
    .eq('status', 'ativo');

  if (listingsError) throw normalizeError(listingsError);
  if (!Array.isArray(listings)) throw new SellerStorefrontServiceError('unexpected', 'A consulta de anúncios retornou um formato inesperado.');

  const mappedListings = listings
    .filter(isRecord)
    .map((row) => mapListing(row as ListingRow, validatedSellerId))
    .filter((listing): listing is SellerStorefrontListing => listing !== null);

  return { seller: mappedSeller, listings: mappedListings };
}

export const __sellerStorefrontTestables = {
  normalizeError,
  mapSeller,
  mapListing,
};
