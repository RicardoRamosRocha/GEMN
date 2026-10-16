import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem, CartStoragePayload } from '../types/cart';
import { sanitizeCartItems } from './cart';

export function cartStorageKey(userId: string) {
  return `gemn.cart.v1.${userId}`;
}

export async function loadCart(userId: string): Promise<CartItem[]> {
  const raw = await AsyncStorage.getItem(cartStorageKey(userId));
  if (!raw) return [];
  try {
    const payload = JSON.parse(raw) as Partial<CartStoragePayload> | CartItem[];
    const items = Array.isArray(payload) ? payload : payload?.version === 1 ? payload.items : [];
    return sanitizeCartItems(items);
  } catch {
    return [];
  }
}

export async function saveCart(userId: string, items: CartItem[]) {
  const payload: CartStoragePayload = { version: 1, items };
  await AsyncStorage.setItem(cartStorageKey(userId), JSON.stringify(payload));
}

export async function clearCartStorage(userId: string) {
  await AsyncStorage.removeItem(cartStorageKey(userId));
}

export const __cartStorageTestables = { cartStorageKey };
