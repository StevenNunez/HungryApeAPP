'use client';

import { createContext, useState, useMemo, ReactNode } from 'react';
import type { CartItem, MenuItem } from '@/lib/types';

interface CartContextType {
  cartItems: CartItem[];
  addToCart: (item: MenuItem) => void;
  removeFromCart: (itemId: string) => void;
  updateQuantity: (itemId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
}

export const CartContext = createContext<CartContextType | undefined>(undefined);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cartItems, setCartItems] = useState<CartItem[]>([]);

  const addToCart = (item: MenuItem) => {
    setCartItems((prevItems) => {
      const existingItem = prevItems.find((i) => i.id === item.id);
      
      // Stock check
      if (existingItem) {
        if (existingItem.quantity >= item.stock) {
          // You could throw an error or use a toast here
          // For now, we just cap it at stock
          return prevItems;
        }
        return prevItems.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      
      // If item hasn't reached stock yet, add it
      if (item.stock > 0) {
        return [...prevItems, { ...item, quantity: 1 }];
      }
      return prevItems;
    });
  };

  const removeFromCart = (itemId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, quantity: number) => {
    setCartItems((prevItems) => {
      const item = prevItems.find(i => i.id === itemId);
      if (!item) return prevItems;

      if (quantity <= 0) {
        return prevItems.filter((i) => i.id !== itemId);
      }

      // Respect stock limit
      const finalQuantity = Math.min(quantity, item.stock);
      
      return prevItems.map((i) =>
        i.id === itemId ? { ...i, quantity: finalQuantity } : i
      );
    });
  };
  
  const clearCart = () => {
    setCartItems([]);
  };

  const cartTotal = useMemo(() => {
    return cartItems.reduce((total, item) => total + item.price * item.quantity, 0);
  }, [cartItems]);

  const value = useMemo(() => ({
    cartItems,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    cartTotal,
  }), [cartItems, cartTotal]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
