import { randomUUID } from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';

import { supabase } from '../lib/supabase';
import {
  SellerBrandingServiceError,
  type SellerBranding,
  type SellerBrandingImage,
  type SellerBrandingImageKind,
  type SellerBrandingStore,
  type SellerBrandingUpdate,
  type SellerBrandingUpdateResult,
  type SellerProfile,
  type SellerProfileUpdate,
} from '../types/sellerBranding';

export { SellerBrandingServiceError } from '../types/sellerBranding';

export const SELLER_BRANDING_BUCKET = 'seller-branding' as const;
export const SELLER_BRANDING_SIGNED_URL_SECONDS = 300 as const;
export const SELLER_BRANDING_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const SELLER_BRANDING_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const SELLER_BRANDING_SELLER_SELECT = 'id,nome_negocio,descricao,status' as const;
export const SELLER_BRANDING_SELECT = 'seller_id,logo_path,banner_path,atualizado_em' as const;
export const SELLER_DIRECTORY_BRANDING_SELECT = 'seller_id,logo_path' as const;
export const SELLER_PROFILE_RPC = 'set_seller_profile' as const;
export const SELLER_PROFILE_MAX_NAME_LENGTH = 255 as const;
export const SELLER_PROFILE_MAX_DESCRIPTION_LENGTH = 5000 as const;

type UnknownRecord = Record<string, unknown>;
type SellerRow = UnknownRecord & { id?: unknown; nome_negocio?: unknown; descricao?: unknown; status?: unknown };
type BrandingRow = UnknownRecord & { seller_id?: unknown; logo_path?: unknown; banner_path?: unknown; atualizado_em?: unknown };

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

function classifyError(error: unknown): SellerBrandingServiceError {
  if (error instanceof SellerBrandingServiceError) return error;
  const message = errorMessage(error);
  const code = errorCode(error);
  if ((message.includes('permission') || message.includes('permiss')) && (message.includes('media') || message.includes('photo') || message.includes('image'))) {
    return new SellerBrandingServiceError('authorization', 'Permissão para selecionar imagens recusada.', { code });
  }
  if (code === 'PGRST301' || code === '401' || message.includes('not authenticated') || message.includes('jwt') && message.includes('expired')) {
    return new SellerBrandingServiceError('auth', 'É necessário estar autenticado para acessar a identidade visual.', { code });
  }
  if (code === 'P0001' && message.includes('nao possui vendedor')) {
    return new SellerBrandingServiceError('authorization', 'Você não tem autorização para atualizar os dados comerciais.', { code });
  }
  if (code === 'P0001' && (message.includes('usuario autenticado') || message.includes('autenticado'))) {
    return new SellerBrandingServiceError('auth', 'É necessário estar autenticado para atualizar os dados comerciais.', { code });
  }
  if (code === 'P0001' && (message.includes('vendedor suspenso') || message.includes('possui vendedor'))) {
    return new SellerBrandingServiceError('authorization', 'Você não tem autorização para atualizar os dados comerciais.', { code });
  }
  if (code === 'P0001' && (message.includes('nome do negocio') || message.includes('descricao'))) {
    return new SellerBrandingServiceError('validation', 'Os dados comerciais informados são inválidos.', { code });
  }
  if (code === '403' || code === '42501' || message.includes('permission denied') || message.includes('not authorized') || message.includes('row-level security')) {
    return new SellerBrandingServiceError('authorization', 'Você não tem autorização para acessar esta identidade visual.', { code });
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection') || message.includes('expired')) {
    return new SellerBrandingServiceError('network', 'Não foi possível conectar ao GEMN. Tente novamente.', { code, retryable: true });
  }
  return new SellerBrandingServiceError('unexpected', 'Não foi possível concluir a operação. Tente novamente.', { code });
}

function sanitizeDiagnosticMessage(message: string): string {
  return message
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/(?:logo|banner)\/[0-9a-f-]+\.(?:jpg|jpeg|png|webp)\b/gi, '<branding-path>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>')
    .replace(/seller-branding\/[^\s"'`]+/gi, 'seller-branding/<path>')
    .replace(/\bBearer\s+[^\s]+/gi, 'Bearer <token>')
    .replace(/\b(?:token|password|senha)\s*[:=]\s*[^\s,;]+/gi, '$1=<redacted>')
    .slice(0, 240);
}

function normalizeError(error: unknown): SellerBrandingServiceError {
  const normalized = classifyError(error);
  if (__DEV__) {
    console.warn('[sellerBranding] service error', {
      code: normalized.code ?? 'unknown',
      category: normalized.kind,
      message: sanitizeDiagnosticMessage(errorMessage(error)),
    });
  }
  return normalized;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SellerBrandingServiceError('unexpected', `Retorno inválido: ${field} ausente.`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  return requiredString(value, field);
}

function validUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedProfileText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateSellerProfileUpdate(input: SellerProfileUpdate): SellerProfileUpdate {
  if (typeof input.storeName !== 'string' || normalizedProfileText(input.storeName) === '') {
    throw new SellerBrandingServiceError('validation', 'O nome comercial é obrigatório.');
  }
  if (normalizedProfileText(input.storeName).length > SELLER_PROFILE_MAX_NAME_LENGTH) {
    throw new SellerBrandingServiceError('validation', 'O nome comercial deve ter no máximo 255 caracteres.');
  }
  if (input.description !== undefined && input.description !== null && typeof input.description !== 'string') {
    throw new SellerBrandingServiceError('validation', 'A descrição comercial é inválida.');
  }
  if (typeof input.description === 'string' && normalizedProfileText(input.description).length > SELLER_PROFILE_MAX_DESCRIPTION_LENGTH) {
    throw new SellerBrandingServiceError('validation', 'A descrição comercial deve ter no máximo 5.000 caracteres.');
  }
  return input;
}

export function validateSellerBrandingSellerId(sellerId: unknown): string {
  if (!validUuid(sellerId)) throw new SellerBrandingServiceError('validation', 'O identificador do vendedor é inválido.');
  return sellerId;
}

function validPath(sellerId: string, kind: SellerBrandingImageKind, path: string | null): path is string {
  if (!path) return false;
  const pattern = new RegExp(`^${sellerId}/${kind}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\\.(jpg|jpeg|png|webp)$`, 'i');
  return pattern.test(path);
}

export async function getSellerDirectoryLogoUrls(sellerIds: string[]): Promise<Map<string, string | null>> {
  const uniqueSellerIds = [...new Set(sellerIds.filter(validUuid))];
  const logoUrls = new Map(uniqueSellerIds.map((sellerId) => [sellerId, null as string | null]));
  if (uniqueSellerIds.length === 0) return logoUrls;

  const { data: brandingRows, error: brandingError } = await supabase
    .from('seller_branding')
    .select(SELLER_DIRECTORY_BRANDING_SELECT)
    .in('seller_id', uniqueSellerIds);
  if (brandingError) {
    return logoUrls;
  }
  if (!Array.isArray(brandingRows)) {
    return logoUrls;
  }

  const pathToSellerId = new Map<string, string>();
  for (const row of brandingRows) {
    if (!isRecord(row) || typeof row.seller_id !== 'string' || !uniqueSellerIds.includes(row.seller_id)) {
      continue;
    }
    if (row.logo_path === null || row.logo_path === undefined) continue;
    if (typeof row.logo_path !== 'string' || !validPath(row.seller_id, 'logo', row.logo_path)) {
      continue;
    }
    pathToSellerId.set(row.logo_path, row.seller_id);
  }

  const paths = [...pathToSellerId.keys()];
  if (paths.length === 0) return logoUrls;

  const { data: signedRows, error: signedError } = await supabase
    .storage
    .from(SELLER_BRANDING_BUCKET)
    .createSignedUrls(paths, SELLER_BRANDING_SIGNED_URL_SECONDS);
  if (signedError) {
    return logoUrls;
  }
  if (!Array.isArray(signedRows)) {
    return logoUrls;
  }

  for (const signedRow of signedRows) {
    if (!isRecord(signedRow) || typeof signedRow.path !== 'string') {
      continue;
    }
    const sellerId = pathToSellerId.get(signedRow.path);
    if (!sellerId) continue;
    if (typeof signedRow.signedUrl !== 'string' || signedRow.signedUrl.trim() === '') {
      continue;
    }
    logoUrls.set(sellerId, signedRow.signedUrl);
  }
  return logoUrls;
}

function extensionForMimeType(mimeType: string) {
  return mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
}

function normalizedMimeType(image: SellerBrandingImage): string | null {
  const mimeType = (image.mimeType ?? image.file?.type)?.toLowerCase().split(';')[0];
  if (mimeType && SELLER_BRANDING_ALLOWED_MIME_TYPES.includes(mimeType as typeof SELLER_BRANDING_ALLOWED_MIME_TYPES[number])) return mimeType;
  const extension = image.fileName?.toLowerCase().split('.').pop();
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'png' || extension === 'webp') return `image/${extension}`;
  return null;
}

export function validateBrandingImage(image: SellerBrandingImage): string {
  const mimeType = normalizedMimeType(image);
  if (!mimeType) throw new SellerBrandingServiceError('validation', 'A imagem precisa estar no formato JPEG, PNG ou WebP.');
  if (image.fileSize !== undefined && image.fileSize > SELLER_BRANDING_MAX_FILE_SIZE) {
    throw new SellerBrandingServiceError('validation', 'A imagem deve ter no máximo 5 MiB.');
  }
  return mimeType;
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new SellerBrandingServiceError('auth', 'É necessário estar autenticado para acessar a identidade visual.');
  return data.user;
}

async function sellerIsOwnedByUser(sellerId: string, userId: string) {
  const { data, error } = await supabase
    .from('sellers')
    .select('id')
    .eq('id', sellerId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw normalizeError(error);
  return Boolean(data);
}

function mapBranding(row: BrandingRow, sellerId: string): SellerBranding {
  const mappedSellerId = requiredString(row.seller_id, 'seller_id');
  if (mappedSellerId !== sellerId) throw new SellerBrandingServiceError('unexpected', 'Retorno inválido: seller_id divergente.');
  const logoPath = optionalString(row.logo_path, 'logo_path');
  const bannerPath = optionalString(row.banner_path, 'banner_path');
  if (logoPath && !validPath(sellerId, 'logo', logoPath)) throw new SellerBrandingServiceError('unexpected', 'Retorno inválido: logo_path.');
  if (bannerPath && !validPath(sellerId, 'banner', bannerPath)) throw new SellerBrandingServiceError('unexpected', 'Retorno inválido: banner_path.');
  return {
    sellerId,
    logoPath,
    bannerPath,
    atualizadoEm: requiredString(row.atualizado_em, 'atualizado_em'),
  };
}

function mapStore(seller: SellerRow, branding: SellerBranding): SellerBrandingStore {
  const status = seller.status;
  if (status !== 'ativo' && status !== 'suspenso') throw new SellerBrandingServiceError('unavailable', 'Esta loja não está disponível.');
  return {
    sellerId: requiredString(seller.id, 'id'),
    storeName: requiredString(seller.nome_negocio, 'nome_negocio'),
    description: requiredString(seller.descricao, 'descricao'),
    status,
    branding,
  };
}

function mapSellerProfile(row: UnknownRecord): SellerProfile {
  const sellerId = requiredString(row.seller_id, 'seller_id');
  if (!validUuid(sellerId)) throw new SellerBrandingServiceError('unexpected', 'Retorno inválido: seller_id.');
  if (typeof row.descricao !== 'string') throw new SellerBrandingServiceError('unexpected', 'Retorno inválido: descricao ausente.');
  return {
    sellerId,
    storeName: requiredString(row.nome_negocio, 'nome_negocio'),
    description: row.descricao,
    atualizadoEm: requiredString(row.atualizado_em, 'atualizado_em'),
  };
}

export async function updateSellerProfile(input: SellerProfileUpdate): Promise<SellerProfile> {
  await requireAuthenticatedUser();
  const validated = validateSellerProfileUpdate(input);

  try {
    const { data, error } = await supabase.rpc(SELLER_PROFILE_RPC, {
      p_nome_negocio: validated.storeName,
      p_descricao: validated.description ?? null,
    });
    if (error) throw normalizeError(error);
    return mapSellerProfile(rpcRow(data));
  } catch (error) {
    throw normalizeError(error);
  }
}

async function signPath(path: string | null) {
  if (!path) return undefined;
  const { data, error } = await supabase.storage.from(SELLER_BRANDING_BUCKET).createSignedUrl(path, SELLER_BRANDING_SIGNED_URL_SECONDS);
  if (error || !data?.signedUrl) throw normalizeError(error ?? new Error('Signed URL ausente.'));
  return data.signedUrl;
}

export async function getSellerBranding(sellerId: string): Promise<SellerBrandingStore> {
  const validatedSellerId = validateSellerBrandingSellerId(sellerId);
  const user = await requireAuthenticatedUser();
  const { data: seller, error: sellerError } = await supabase
    .from('sellers')
    .select(SELLER_BRANDING_SELLER_SELECT)
    .eq('id', validatedSellerId)
    .maybeSingle();
  if (sellerError) throw normalizeError(sellerError);
  if (!seller) throw new SellerBrandingServiceError('not_found', 'Vendedor não encontrado.');

  const sellerRow = seller as SellerRow;
  const owner = await sellerIsOwnedByUser(validatedSellerId, user.id);
  if (sellerRow.status === 'suspenso' && !owner) throw new SellerBrandingServiceError('unavailable', 'Esta loja não está disponível.');
  if (sellerRow.status !== 'ativo' && sellerRow.status !== 'suspenso') throw new SellerBrandingServiceError('unavailable', 'Esta loja não está disponível.');

  const { data: branding, error: brandingError } = await supabase
    .from('seller_branding')
    .select(SELLER_BRANDING_SELECT)
    .eq('seller_id', validatedSellerId)
    .maybeSingle();
  if (brandingError) throw normalizeError(brandingError);

  const mappedBranding = branding
    ? mapBranding(branding as BrandingRow, validatedSellerId)
    : { sellerId: validatedSellerId, logoPath: null, bannerPath: null, atualizadoEm: new Date(0).toISOString() };
  const [logoUrl, bannerUrl] = await Promise.all([signPath(mappedBranding.logoPath), signPath(mappedBranding.bannerPath)]);
  return mapStore(sellerRow, { ...mappedBranding, logoUrl, bannerUrl });
}

export async function getCurrentSellerBranding(): Promise<SellerBrandingStore> {
  const user = await requireAuthenticatedUser();
  const { data, error } = await supabase
    .from('sellers')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw normalizeError(error);
  if (!data || typeof data.id !== 'string') throw new SellerBrandingServiceError('not_found', 'Vendedor não encontrado.');
  return getSellerBranding(data.id);
}

async function uploadBrandingImage(sellerId: string, kind: SellerBrandingImageKind, image: SellerBrandingImage): Promise<string> {
  const mimeType = validateBrandingImage(image);
  const body = image.file ?? await (await fetch(image.uri)).arrayBuffer();
  const bodySize = body instanceof ArrayBuffer ? body.byteLength : body.size;
  if (bodySize > SELLER_BRANDING_MAX_FILE_SIZE) throw new SellerBrandingServiceError('validation', 'A imagem deve ter no máximo 5 MiB.');
  const path = `${sellerId}/${kind}/${randomUUID()}.${extensionForMimeType(mimeType)}`;
  const { error } = await supabase.storage.from(SELLER_BRANDING_BUCKET).upload(path, body, { contentType: mimeType, upsert: false });
  if (error) throw normalizeError(error);
  return path;
}

async function removeOwnedBrandingFiles(sellerId: string, paths: string[]) {
  const safePaths = paths.filter((path) => validPath(sellerId, 'logo', path) || validPath(sellerId, 'banner', path));
  if (safePaths.length === 0) return [];
  const { data, error } = await supabase.storage.from(SELLER_BRANDING_BUCKET).remove(safePaths);
  if (error) throw normalizeError(error);
  if (!Array.isArray(data)) throw new SellerBrandingServiceError('unexpected', 'A limpeza da identidade visual não retornou confirmação suficiente.');
  const removed = new Set(data.filter((item) => typeof item.name === 'string').map((item) => item.name));
  return safePaths.filter((path) => !removed.has(path));
}

function rpcRow(value: unknown): UnknownRecord {
  const rows = Array.isArray(value) ? value : [value];
  const row = rows.length === 1 ? rows[0] : null;
  if (!isRecord(row)) throw new SellerBrandingServiceError('unexpected', 'A atualização da identidade visual retornou um formato inesperado.');
  return row;
}

export async function updateSellerBranding(sellerId: string, changes: SellerBrandingUpdate): Promise<SellerBrandingUpdateResult> {
  const validatedSellerId = validateSellerBrandingSellerId(sellerId);
  await requireAuthenticatedUser();
  const current = await getSellerBranding(validatedSellerId);
  if (current.status !== 'ativo') throw new SellerBrandingServiceError('authorization', 'Vendedor suspenso não pode alterar a identidade visual.');
  if (changes.logo === undefined && changes.banner === undefined) throw new SellerBrandingServiceError('validation', 'Informe uma alteração de logo ou banner.');

  const uploadedPaths: string[] = [];
  let rpcConfirmed = false;
  try {
    const nextLogoPath = changes.logo === undefined ? current.branding.logoPath : changes.logo === null ? null : await uploadBrandingImage(validatedSellerId, 'logo', changes.logo);
    if (typeof nextLogoPath === 'string' && nextLogoPath !== current.branding.logoPath) uploadedPaths.push(nextLogoPath);
    const nextBannerPath = changes.banner === undefined ? current.branding.bannerPath : changes.banner === null ? null : await uploadBrandingImage(validatedSellerId, 'banner', changes.banner);
    if (typeof nextBannerPath === 'string' && nextBannerPath !== current.branding.bannerPath) uploadedPaths.push(nextBannerPath);

    const { data, error } = await supabase.rpc('set_seller_branding', {
      p_logo_path: nextLogoPath,
      p_banner_path: nextBannerPath,
    });
    if (error) {
      const normalized = normalizeError(error);
      if (normalized.kind === 'network' || normalized.retryable) {
        const reconciled = await getSellerBranding(validatedSellerId).catch(() => null);
        const confirmed = reconciled?.branding.logoPath === nextLogoPath && reconciled.branding.bannerPath === nextBannerPath;
        if (confirmed && reconciled) {
          const oldPaths = [current.branding.logoPath, current.branding.bannerPath].filter((path): path is string => path !== null && !uploadedPaths.includes(path));
          const cleanupPending = await removeOwnedBrandingFiles(validatedSellerId, oldPaths).catch(() => oldPaths);
          return { store: reconciled, cleanupPending };
        }
        const oldStateConfirmed = reconciled
          && reconciled.branding.logoPath === current.branding.logoPath
          && reconciled.branding.bannerPath === current.branding.bannerPath;
        if (oldStateConfirmed) {
          const cleanupPending = await removeOwnedBrandingFiles(validatedSellerId, uploadedPaths).catch(() => uploadedPaths);
          throw new SellerBrandingServiceError('network', 'A atualização da identidade visual não foi confirmada.', { code: normalized.code, retryable: true, cleanupPending });
        }
        const cleanupPending = uploadedPaths;
        throw new SellerBrandingServiceError('network', 'Não foi possível confirmar a atualização da identidade visual.', { code: normalized.code, retryable: true, responseUnknown: true, cleanupPending });
      }
      throw normalized;
    }

    const mapped = mapBranding(rpcRow(data), validatedSellerId);
    rpcConfirmed = true;
    const oldPaths = [current.branding.logoPath, current.branding.bannerPath].filter((path): path is string => Boolean(path) && path !== mapped.logoPath && path !== mapped.bannerPath);
    const cleanupPending = await removeOwnedBrandingFiles(validatedSellerId, oldPaths).catch(() => oldPaths);
    const store = await getSellerBranding(validatedSellerId);
    return { store, cleanupPending };
  } catch (error) {
    const normalized = normalizeError(error);
    if (!rpcConfirmed && !normalized.responseUnknown && uploadedPaths.length > 0) {
      const cleanupPending = await removeOwnedBrandingFiles(validatedSellerId, uploadedPaths).catch(() => uploadedPaths);
      if (cleanupPending.length > 0) {
        throw new SellerBrandingServiceError(normalized.kind, normalized.message, { code: normalized.code, retryable: normalized.retryable, responseUnknown: normalized.responseUnknown, cleanupPending });
      }
    }
    throw normalized;
  }
}

export async function pickSellerBrandingImage(): Promise<SellerBrandingImage | null> {
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
  } catch (error) {
    throw normalizeError(error);
  }
  if (result.canceled) return null;
  const asset = result.assets[0];
  const image: SellerBrandingImage = { uri: asset.uri, fileName: asset.fileName, fileSize: asset.fileSize, mimeType: asset.mimeType, file: asset.file };
  validateBrandingImage(image);
  return image;
}

export const __sellerBrandingTestables = {
  normalizeError,
  validPath,
  mapBranding,
  mapSellerProfile,
  normalizedMimeType,
  rpcRow,
  normalizedProfileText,
  getSellerDirectoryLogoUrls,
  buildSellerProfileRpcArgs: (input: SellerProfileUpdate) => {
    const validated = validateSellerProfileUpdate(input);
    return {
      p_nome_negocio: validated.storeName,
      p_descricao: validated.description ?? null,
    };
  },
};
