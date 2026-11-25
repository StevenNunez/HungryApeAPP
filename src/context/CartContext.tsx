'use client';

import { createContext, useState, useMemo, useEffect, useRef, ReactNode } from 'react';
import type { CartItem, MenuItem, SelectedModifier } from '@/lib/types';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: MenuItem, modifiers?: SelectedModifier[]) => void;
  removeFromCart: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  /** False when the business has no active plan: the menu shows, ordering pauses. */
  ordersOpen: boolean;
  setOrdersOpen: (open: boolean) => void;
  /** Plan and online payments of the business, provided by the menu page (server data). */
  payment: { plan: string; online: boolean } | null;
  setPayment: (p: { plan: string; online: boolean } | null) => void;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

/** Max units per cart line — the server (create_order) rejects more. */
export const MAX_QTY_PER_LINE = 10;

function buildCartKey(itemId: string, modifiers: SelectedModifier[]): string {
  const sortedIds = modifiers.map(m => m.optionId).sort().join(',');
  return `${itemId}__${sortedIds}`;
}

/**
 * `storageKey` (one per business) keeps the cart in sessionStorage, so it survives
 * switching to the bank app or the phone discarding the tab, and is gone when the tab closes.
 */
export function CartProvider({ children, storageKey }: { children: ReactNode; storageKey?: string }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [ordersOpen, setOrdersOpen] = useState(true);
  const [payment, setPayment] = useState<{ plan: string; online: boolean } | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    hydrated.current = false;
    if (!storageKey) { hydrated.current = true; return; }
    try {
      const raw = sessionStorage.getItem(storageKey);
      const saved = raw ? JSON.parse(raw) : null;
      if (Array.isArray(saved)) setCartItems(saved.filter(i => i && typeof i.cartKey === 'string' && i.quantity > 0));
    } catch { /* private mode / corrupt data: start empty */ }
    hydrated.current = true;
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !hydrated.current) return;
    try {
      if (cartItems.length === 0) sessionStorage.removeItem(storageKey);
      else sessionStorage.setItem(storageKey, JSON.stringify(cartItems));
    } catch { /* storage full or blocked: the cart still works in memory */ }
  }, [cartItems, storageKey]);

  const addToCart = (item: MenuItem, modifiers: SelectedModifier[] = []) => {
    const cartKey = buildCartKey(item.id, modifiers);
    const modifierPrice = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);

    setCartItems((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);

      if (existing) {
        if (existing.quantity >= Math.min(item.stock, MAX_QTY_PER_LINE)) return prev;
        return prev.map((i) =>
          i.cartKey === cartKey ? { ...i, quantity: i.quantity + 1 } : i
        );
      }

      if (item.stock <= 0) return prev;
      return [
        ...prev,
        { ...item, quantity: 1, cartKey, selectedModifiers: modifiers, modifierPrice },
      ];
    });
  };

  const removeFromCart = (cartKey: string) => {
    setCartItems((prev) => prev.filter((i) => i.cartKey !== cartKey));
  };

  const updateQuantity = (cartKey: string, quantity: number) => {
    setCartItems((prev) => {
      const item = prev.find((i) => i.cartKey === cartKey);
      if (!item) return prev;
      if (quantity <= 0) return prev.filter((i) => i.cartKey !== cartKey);
      return prev.map((i) =>
        i.cartKey === cartKey ? { ...i, quantity: Math.min(quantity, item.stock, MAX_QTY_PER_LINE) } : i
      );
    });
  };

  const clearCart = () => setCartItems([]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.price + item.modifierPrice) * item.quantity, 0),
    [cartItems]
  );

  const value = useMemo(
    () => ({ cartItems, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal, ordersOpen, setOrdersOpen, payment, setPayment }),
    [cartItems, cartTotal, ordersOpen, payment]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
