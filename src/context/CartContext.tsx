import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { addCartItem, removeCartItem, updateCartItemQuantity } from '../services/cart';
import { clearCartStorage, loadCart, saveCart } from '../services/cartStorage';
import type { CartItem } from '../types/cart';

type CartContextValue = {
  items: CartItem[];
  loading: boolean;
  error: string | null;
  itemCount: number;
  addItem: (item: Omit<CartItem, 'addedAt'>) => void;
  removeItem: (listingId: string) => void;
  updateQuantity: (listingId: string, quantity: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | undefined>(undefined);
const GUEST_CART_USER_ID = 'guest';

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadRequestRef = useRef(0);
  const writeQueueRef = useRef(Promise.resolve());
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    const requestId = ++loadRequestRef.current;
    setItems([]);
    setLoadedUserId(null);
    setError(null);
    if (authLoading) {
      setLoading(true);
      return;
    }
    setLoading(true);
    void Promise.all([
      loadCart(userId ?? GUEST_CART_USER_ID),
      userId ? loadCart(GUEST_CART_USER_ID) : Promise.resolve([]),
    ])
      .then(([storedItems, guestItems]) => {
        if (requestId !== loadRequestRef.current) return;
        const mergedItems = userId
          ? guestItems.reduce((current, item) => addCartItem(current, item), storedItems)
          : storedItems;
        setItems(mergedItems);
        setLoadedUserId(userId ?? GUEST_CART_USER_ID);
        if (userId && guestItems.length > 0) {
          void saveCart(userId, mergedItems);
          void clearCartStorage(GUEST_CART_USER_ID);
        }
      })
      .catch(() => {
        if (requestId !== loadRequestRef.current) return;
        setError('Não foi possível carregar seu carrinho local.');
      })
      .finally(() => {
        if (requestId === loadRequestRef.current) setLoading(false);
      });
  }, [authLoading, userId]);

  const persist = useCallback((nextItems: CartItem[]) => {
    const currentUserId = userId ?? GUEST_CART_USER_ID;
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(() => saveCart(currentUserId, nextItems))
      .catch(() => setError('Não foi possível salvar seu carrinho local.'));
  }, [userId]);

  const addItem = useCallback((item: Omit<CartItem, 'addedAt'>) => {
    setItems((current) => {
      const next = addCartItem(current, item);
      persist(next);
      return next;
    });
    setError(null);
  }, [persist]);

  const removeItem = useCallback((listingId: string) => {
    setItems((current) => {
      const next = removeCartItem(current, listingId);
      persist(next);
      return next;
    });
  }, [persist]);

  const updateQuantity = useCallback((listingId: string, quantity: number) => {
    setItems((current) => {
      const next = updateCartItemQuantity(current, listingId, quantity);
      persist(next);
      return next;
    });
  }, [persist]);

  const clear = useCallback(() => {
    setItems((current) => {
      const next: CartItem[] = [];
      if (current.length > 0) persist(next);
      return next;
    });
  }, [persist]);

  const visibleItems = loadedUserId === (userId ?? GUEST_CART_USER_ID) && !loading ? items : [];
  const value = useMemo(() => ({
    items: visibleItems, loading, error, itemCount: visibleItems.reduce((total, item) => total + item.quantity, 0), addItem, removeItem, updateQuantity, clear,
  }), [addItem, clear, error, loading, removeItem, updateQuantity, visibleItems]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart deve ser usado dentro de CartProvider.');
  return context;
}
