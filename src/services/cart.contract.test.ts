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

const sellerDisabledListing = __cartValidationTestables.mapCurrentListing({
  id: first.listingId,
  seller_id: first.sellerId,
  nome: 'Produto GEMN indisponivel',
  preco_real: '30.00',
  aceita_gemn: true,
  preco_gemn: '20.00',
  imagem_principal: null,
  status: 'ativo',
  sellers: { id: first.sellerId, nome_negocio: 'Loja A', status: 'ativo', aceita_gemn: false },
});
if (sellerDisabledListing.acceptsGemn || sellerDisabledListing.gemnValue !== null || sellerDisabledListing.sellerAcceptsGemn) throw new Error('effective GEMN eligibility was not normalized');
const representationOnly = __cartValidationTestables.compareKnownListing({
  listingId: first.listingId,
  sellerId: first.sellerId,
  price: 30,
  acceptsGemn: false,
  gemnValue: undefined,
  sellerAcceptsGemn: undefined,
}, sellerDisabledListing);
if (representationOnly.length !== 0) throw new Error('null/undefined and numeric/string representations caused a false GEMN change');

const realGemnChange = __cartValidationTestables.compareKnownListing({
  listingId: first.listingId,
  sellerId: first.sellerId,
  price: 30,
  acceptsGemn: true,
  gemnValue: 20,
  sellerAcceptsGemn: true,
}, { ...sellerDisabledListing, acceptsGemn: true, gemnValue: 25, sellerAcceptsGemn: true });
if (!realGemnChange.some((change) => change.code === 'gemn_rules_changed')) throw new Error('real GEMN rule change was not detected');

const grouped = __cartValidationTestables.sellerSubtotals([
  { cartItem: first, currentListing: { listingId: first.listingId, sellerId: first.sellerId, sellerName: 'Loja A', name: 'Produto A', price: 10, acceptsGemn: false, gemnValue: null, sellerAcceptsGemn: false, active: true }, valid: true, issues: [], changes: [], estimatedSubtotal: 20 },
]);
if (grouped.length !== 1 || grouped[0].sellerId !== 'seller-a' || grouped[0].subtotal !== 20) throw new Error('seller subtotal grouping changed');
