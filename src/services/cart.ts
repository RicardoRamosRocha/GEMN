import type { CartItem } from '../types/cart';
import { CART_MAX_QUANTITY } from '../types/cart';

export function isPositiveInteger(value: number) {
  return Number.isInteger(value) && value > 0;
}

export function normalizeQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(CART_MAX_QUANTITY, Math.max(1, Math.trunc(value)));
}

export function addCartItem(items: CartItem[], item: Omit<CartItem, 'addedAt'> & { addedAt?: string }): CartItem[] {
  if (!item.listingId || !item.sellerId || !isPositiveInteger(item.quantity)) return items;
  const quantity = normalizeQuantity(item.quantity);
  const existing = items.find((current) => current.listingId === item.listingId);
  if (!existing) {
    return [...items, { ...item, quantity, addedAt: item.addedAt ?? new Date().toISOString() }];
  }

  return items.map((current) => current.listingId === item.listingId
    ? { ...current, quantity: normalizeQuantity(current.quantity + quantity) }
    : current);
}

export function updateCartItemQuantity(items: CartItem[], listingId: string, quantity: number) {
  if (!isPositiveInteger(quantity)) return items.filter((item) => item.listingId !== listingId);
  return items.map((item) => item.listingId === listingId ? { ...item, quantity: normalizeQuantity(quantity) } : item);
}

export function removeCartItem(items: CartItem[], listingId: string) {
  return items.filter((item) => item.listingId !== listingId);
}

export function sanitizeCartItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  let result: CartItem[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'object' || candidate === null) continue;
    const item = candidate as Partial<CartItem>;
    if (typeof item.listingId !== 'string' || !item.listingId || typeof item.sellerId !== 'string' || !item.sellerId) continue;
    if (typeof item.quantity !== 'number' || !isPositiveInteger(item.quantity)) continue;
    if (typeof item.addedAt !== 'string' || !item.addedAt) continue;
    result = addCartItem(result, { listingId: item.listingId, sellerId: item.sellerId, quantity: item.quantity, addedAt: item.addedAt });
  }
  return result;
}

export const __cartTestables = { isPositiveInteger, normalizeQuantity, addCartItem, updateCartItemQuantity, removeCartItem, sanitizeCartItems };
