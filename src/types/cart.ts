export const CART_MAX_QUANTITY = 99;

export type CartItem = {
  listingId: string;
  sellerId: string;
  quantity: number;
  addedAt: string;
};

export type CartStoragePayload = {
  version: 1;
  items: CartItem[];
};

export type CartKnownListing = {
  listingId: string;
  sellerId: string;
  price: number;
  acceptsGemn: boolean;
  gemnValue?: number;
  sellerAcceptsGemn?: boolean;
};

export type CartValidationIssueCode =
  | 'invalid_quantity'
  | 'unavailable_listing'
  | 'seller_unavailable'
  | 'price_changed'
  | 'gemn_rules_changed';

export type CartDetectedChange = {
  code: Extract<CartValidationIssueCode, 'price_changed' | 'gemn_rules_changed'>;
  previousValue?: number | boolean | null;
  currentValue?: number | boolean | null;
};

export type CartValidationItem = {
  cartItem: CartItem;
  currentListing: CartCurrentListing | null;
  valid: boolean;
  issues: CartValidationIssueCode[];
  changes: CartDetectedChange[];
  estimatedSubtotal: number | null;
};

export type CartCurrentListing = {
  listingId: string;
  sellerId: string;
  sellerName: string;
  name: string;
  price: number;
  acceptsGemn: boolean;
  gemnValue: number | null;
  sellerAcceptsGemn: boolean;
  imageUrl?: string;
  active: true;
};

export type CartSellerSubtotal = {
  sellerId: string;
  sellerName: string;
  itemCount: number;
  subtotal: number;
};

export type CartValidationResult = {
  checkedAt: string;
  items: CartValidationItem[];
  validItems: CartValidationItem[];
  invalidItems: CartValidationItem[];
  detectedChanges: CartDetectedChange[];
  sellerSubtotals: CartSellerSubtotal[];
  estimatedTotal: number;
  cashbackValidation: 'deferred_to_checkout';
};

export type CartCheckoutSellerIntent = {
  sellerId: string;
  idempotencyKey: string;
  listingIds: string[];
};

export type CartCheckoutIntent = {
  checkoutIntentId: string;
  createdAt: string;
  sellers: CartCheckoutSellerIntent[];
};

export type CartCheckoutItemInput = {
  listingId: string;
  quantity: number;
};

export type CartCheckoutOrderItem = {
  orderItemId: string;
  listingId: string;
  quantity: number;
  priceRealUnit: number;
  subtotalReal: number;
  gemnUsedItem: number;
  cashbackPercentual: number;
  cashbackEstimated: number;
};

export type CartCheckoutOrderResult = {
  orderId: string;
  sellerId: string;
  status: 'pendente' | 'confirmado' | 'concluido' | 'cancelado' | 'expirado';
  paymentMethod: 'real' | 'gemn' | 'misto';
  totalReal: number;
  totalGemn: number | null;
  gemnUsed: number;
  dueReal: number;
  cashbackEstimated: number;
  items: CartCheckoutOrderItem[];
};
