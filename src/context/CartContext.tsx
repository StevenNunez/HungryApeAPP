'use client';

import { createContext, useState, useMemo, ReactNode } from 'react';
import type { CartItem, MenuItem, SelectedModifier } from '@/lib/types';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: MenuItem, modifiers?: SelectedModifier[]) => void;
  removeFromCart: (cartKey: string) => void;
  updateQuantity: (cartKey: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

function buildCartKey(itemId: string, modifiers: SelectedModifier[]): string {
  const sortedIds = modifiers.map(m => m.optionId).sort().join(',');
  return `${itemId}__${sortedIds}`;
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = (item: MenuItem, modifiers: SelectedModifier[] = []) => {
    const cartKey = buildCartKey(item.id, modifiers);
    const modifierPrice = modifiers.reduce((sum, m) => sum + m.priceDelta, 0);

    setCartItems((prev) => {
      const existing = prev.find((i) => i.cartKey === cartKey);

      if (existing) {
        if (existing.quantity >= item.stock) return prev;
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
        i.cartKey === cartKey ? { ...i, quantity: Math.min(quantity, item.stock) } : i
      );
    });
  };

  const clearCart = () => setCartItems([]);

  const cartTotal = useMemo(
    () => cartItems.reduce((sum, item) => sum + (item.price + item.modifierPrice) * item.quantity, 0),
    [cartItems]
  );

  const value = useMemo(
    () => ({ cartItems, addToCart, removeFromCart, updateQuantity, clearCart, cartTotal }),
    [cartItems, cartTotal]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
