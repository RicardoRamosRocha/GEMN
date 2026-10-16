import * as Crypto from 'expo-crypto';
import { supabase } from '../lib/supabase';
import type {
  CartCheckoutIntent,
  CartCurrentListing,
  CartDetectedChange,
  CartItem,
  CartKnownListing,
  CartSellerSubtotal,
  CartValidationItem,
  CartValidationIssueCode,
  CartValidationResult,
} from '../types/cart';
import { CART_MAX_QUANTITY } from '../types/cart';

type UnknownRecord = Record<string, unknown>;

const CURRENT_LISTING_SELECT = 'id,seller_id,nome,preco_real,aceita_gemn,preco_gemn,imagem_principal,status,sellers(id,nome_negocio,status,aceita_gemn)';

export type CartValidationErrorKind = 'auth' | 'network' | 'unexpected';

export class CartValidationError extends Error {
  readonly kind: CartValidationErrorKind;
  readonly code?: string;
  readonly retryable: boolean;

  constructor(kind: CartValidationErrorKind, message: string, code?: string, retryable = false) {
    super(message);
    this.name = 'CartValidationError';
    this.kind = kind;
    this.code = code;
    this.retryable = retryable;
  }
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberValue(value: unknown, field: string): number {
  const result = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(result)) throw new CartValidationError('unexpected', `Retorno inválido: ${field}.`);
  return result;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new CartValidationError('unexpected', `Retorno inválido: ${field}.`);
  return value;
}

function nullableNumber(value: unknown, field: string) {
  if (value === null || value === undefined) return null;
  return numberValue(value, field);
}

function normalizeError(error: unknown): CartValidationError {
  const record = isRecord(error) ? error : {};
  const code = typeof record.code === 'string' ? record.code : undefined;
  const rawMessage = typeof record.message === 'string' ? record.message : String(error);
  const message = rawMessage.toLowerCase();
  if (code === '42501' || message.includes('not authenticated') || message.includes('jwt') || message.includes('permission denied')) {
    return new CartValidationError('auth', 'É necessário estar autenticado para validar o carrinho.', code);
  }
  if (message.includes('fetch') || message.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return new CartValidationError('network', 'Não foi possível atualizar os anúncios do carrinho. Tente novamente.', code, true);
  }
  return new CartValidationError('unexpected', 'Não foi possível validar o carrinho.', code);
}

async function requireAuthenticatedUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw normalizeError(error);
  if (!data.user) throw new CartValidationError('auth', 'É necessário estar autenticado para validar o carrinho.');
  return data.user;
}

function sellerRelation(value: unknown): UnknownRecord | null {
  if (Array.isArray(value)) return isRecord(value[0]) ? value[0] : null;
  return isRecord(value) ? value : null;
}

function publicImageUrl(path: unknown) {
  if (typeof path !== 'string' || !path) return undefined;
  return supabase.storage.from('listing-images').getPublicUrl(path).data.publicUrl;
}

function mapCurrentListing(value: unknown): CartCurrentListing {
  if (!isRecord(value)) throw new CartValidationError('unexpected', 'O anúncio retornado é inválido.');
  const seller = sellerRelation(value.sellers);
  if (!seller) throw new CartValidationError('unexpected', 'O vendedor do anúncio não foi retornado.');
  if (value.status !== 'ativo' || seller.status !== 'ativo') throw new CartValidationError('unexpected', 'O anúncio retornado não está ativo.');
  return {
    listingId: requiredString(value.id, 'listing.id'),
    sellerId: requiredString(value.seller_id, 'listing.seller_id'),
    sellerName: requiredString(seller.nome_negocio, 'seller.nome_negocio'),
    name: requiredString(value.nome, 'listing.nome'),
    price: numberValue(value.preco_real, 'listing.preco_real'),
    acceptsGemn: value.aceita_gemn === true,
    gemnValue: nullableNumber(value.preco_gemn, 'listing.preco_gemn'),
    sellerAcceptsGemn: seller.aceita_gemn === true,
    imageUrl: publicImageUrl(value.imagem_principal),
    active: true,
  };
}

function compareKnownListing(known: CartKnownListing | undefined, current: CartCurrentListing): CartDetectedChange[] {
  if (!known) return [];
  const changes: CartDetectedChange[] = [];
  if (known.price !== current.price) changes.push({ code: 'price_changed', previousValue: known.price, currentValue: current.price });
  if (known.acceptsGemn !== current.acceptsGemn || (known.gemnValue ?? null) !== current.gemnValue || (known.sellerAcceptsGemn ?? false) !== current.sellerAcceptsGemn) {
    changes.push({ code: 'gemn_rules_changed', previousValue: known.gemnValue ?? null, currentValue: current.gemnValue });
  }
  return changes;
}

function issueCodes(item: CartItem, current: CartCurrentListing | null, changes: CartDetectedChange[]): CartValidationIssueCode[] {
  const issues: CartValidationIssueCode[] = [];
  if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > CART_MAX_QUANTITY) issues.push('invalid_quantity');
  if (!current) issues.push('unavailable_listing');
  if (current && current.sellerId !== item.sellerId) issues.push('seller_unavailable');
  for (const change of changes) issues.push(change.code);
  return [...new Set(issues)];
}

function sellerSubtotals(items: CartValidationItem[]): CartSellerSubtotal[] {
  const grouped = new Map<string, CartSellerSubtotal>();
  for (const item of items) {
    if (!item.currentListing || item.estimatedSubtotal === null) continue;
    const current = grouped.get(item.currentListing.sellerId) ?? { sellerId: item.currentListing.sellerId, sellerName: item.currentListing.sellerName, itemCount: 0, subtotal: 0 };
    current.itemCount += item.cartItem.quantity;
    current.subtotal += item.estimatedSubtotal;
    grouped.set(current.sellerId, current);
  }
  return [...grouped.values()];
}

export async function fetchCurrentCartListings(items: CartItem[]): Promise<Map<string, CartCurrentListing>> {
  await requireAuthenticatedUser();
  const listingIds = [...new Set(items.map((item) => item.listingId).filter(Boolean))];
  if (listingIds.length === 0) return new Map();
  const { data, error } = await supabase.from('listings').select(CURRENT_LISTING_SELECT).in('id', listingIds);
  if (error) throw normalizeError(error);
  if (!Array.isArray(data)) throw new CartValidationError('unexpected', 'A consulta de anúncios retornou um formato inesperado.');
  const result = new Map<string, CartCurrentListing>();
  for (const row of data) {
    const current = mapCurrentListing(row);
    result.set(current.listingId, current);
  }
  return result;
}

export async function validateCart(items: CartItem[], knownListings: Record<string, CartKnownListing> = {}): Promise<CartValidationResult> {
  const currentListings = await fetchCurrentCartListings(items);
  const validatedItems: CartValidationItem[] = items.map((cartItem) => {
    const currentListing = currentListings.get(cartItem.listingId) ?? null;
    const changes = currentListing ? compareKnownListing(knownListings[cartItem.listingId], currentListing) : [];
    const issues = issueCodes(cartItem, currentListing, changes);
    return {
      cartItem,
      currentListing,
      valid: issues.length === 0,
      issues,
      changes,
      estimatedSubtotal: currentListing && issues.includes('invalid_quantity') === false ? Number((currentListing.price * cartItem.quantity).toFixed(2)) : null,
    };
  });
  const changes = validatedItems.flatMap((item) => item.changes);
  return {
    checkedAt: new Date().toISOString(),
    items: validatedItems,
    validItems: validatedItems.filter((item) => item.valid),
    invalidItems: validatedItems.filter((item) => !item.valid),
    detectedChanges: changes,
    sellerSubtotals: sellerSubtotals(validatedItems),
    estimatedTotal: Number(sellerSubtotals(validatedItems).reduce((sum, seller) => sum + seller.subtotal, 0).toFixed(2)),
    cashbackValidation: 'deferred_to_checkout',
  };
}

export function createCheckoutIntent(items: CartItem[], now = new Date().toISOString()): CartCheckoutIntent {
  const sellerItems = new Map<string, string[]>();
  for (const item of items) sellerItems.set(item.sellerId, [...(sellerItems.get(item.sellerId) ?? []), item.listingId]);
  const checkoutIntentId = Crypto.randomUUID();
  return {
    checkoutIntentId,
    createdAt: now,
    sellers: [...sellerItems.entries()].map(([sellerId, listingIds]) => ({ sellerId, listingIds, idempotencyKey: Crypto.randomUUID() })),
  };
}

export const __cartValidationTestables = { compareKnownListing, issueCodes, sellerSubtotals, mapCurrentListing, normalizeError, createCheckoutIntent };
