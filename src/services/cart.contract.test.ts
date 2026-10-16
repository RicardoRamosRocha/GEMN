import { __cartTestables } from './cart';
import { __cartStorageTestables } from './cartStorage';
import { __cartValidationTestables } from './cartValidation';
import type { CartItem } from '../types/cart';

// Contrato compilável: o projeto ainda não possui runner Jest/Vitest configurado.
const first: CartItem = { listingId: 'listing-a', sellerId: 'seller-a', quantity: 2, addedAt: '2026-10-16T12:00:00.000Z' };
const merged = __cartTestables.addCartItem([first], { listingId: first.listingId, sellerId: first.sellerId, quantity: 3 });
if (merged.length !== 1 || merged[0].quantity !== 5) throw new Error('cart items were not merged by listing');
if (__cartTestables.normalizeQuantity(1000) !== 99) throw new Error('cart quantity upper bound changed');
if (__cartTestables.updateCartItemQuantity(merged, first.listingId, 0).length !== 0) throw new Error('zero quantity must remove the item');
if (__cartStorageTestables.cartStorageKey('user-a') !== 'gemn.cart.v1.user-a') throw new Error('cart storage key contract changed');

const changed = __cartValidationTestables.compareKnownListing({
  listingId: first.listingId,
  sellerId: first.sellerId,
  price: 10,
  acceptsGemn: true,
  gemnValue: 10,
  sellerAcceptsGemn: true,
}, {
  listingId: first.listingId,
  sellerId: first.sellerId,
  sellerName: 'Loja A',
  name: 'Produto A',
  price: 12,
  acceptsGemn: false,
  gemnValue: null,
  sellerAcceptsGemn: true,
  active: true,
});
if (!changed.some((change) => change.code === 'price_changed') || !changed.some((change) => change.code === 'gemn_rules_changed')) throw new Error('cart changes were not detected');

const grouped = __cartValidationTestables.sellerSubtotals([
  { cartItem: first, currentListing: { listingId: first.listingId, sellerId: first.sellerId, sellerName: 'Loja A', name: 'Produto A', price: 10, acceptsGemn: false, gemnValue: null, sellerAcceptsGemn: false, active: true }, valid: true, issues: [], changes: [], estimatedSubtotal: 20 },
]);
if (grouped.length !== 1 || grouped[0].sellerId !== 'seller-a' || grouped[0].subtotal !== 20) throw new Error('seller subtotal grouping changed');
