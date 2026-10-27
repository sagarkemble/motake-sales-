"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

export const CART_LOCAL_STORAGE_KEY = "motake_salesman_cart";

export interface CartLine {
  varietyId: string;
  // Book Now and Pre-order send the Variety SKU and qty only.
  sku: string;
  productId: string;
  productName: string;
  varietyName: string;
  unit: string;
  productImageUrl: string | null;
  quantity: number;
}

interface CartContextValue {
  cartLines: CartLine[];
  totalCartQuantity: number;
  getQuantityForVariety: (varietyId: string) => number;
  setQuantityForVariety: (line: Omit<CartLine, "quantity">, quantity: number) => void;
  removeLine: (varietyId: string) => void;
  clearCart: () => void;
  // The Customer chosen from Route Customers ("Start an order for this shop"); checkout preselects
  // them. Kept for this session only.
  orderForCustomerId: string | null;
  setOrderForCustomerId: (customerId: string | null) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cartLinesByVarietyId, setCartLinesByVarietyId] = useState<Record<string, CartLine>>({});
  const [isInitialized, setIsInitialized] = useState(false);
  const [orderForCustomerId, setOrderForCustomerId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem(CART_LOCAL_STORAGE_KEY);
      if (savedCart) {
        const parsedCart = JSON.parse(savedCart) as Record<string, CartLine>;
        const normalizedCart: Record<string, CartLine> = {};
        for (const [varietyId, line] of Object.entries(parsedCart)) {
          if (!line?.varietyId || !line.sku) continue;
          normalizedCart[varietyId] = line;
        }
        setCartLinesByVarietyId(normalizedCart);
      }
    } catch {}
    setIsInitialized(true);
  }, []);

  useEffect(() => {
    if (!isInitialized) return;
    try {
      window.localStorage.setItem(CART_LOCAL_STORAGE_KEY, JSON.stringify(cartLinesByVarietyId));
    } catch {}
  }, [cartLinesByVarietyId, isInitialized]);

  const cartLines = useMemo(() => Object.values(cartLinesByVarietyId), [cartLinesByVarietyId]);
  const totalCartQuantity = useMemo(
    () => cartLines.reduce((runningTotal, line) => runningTotal + line.quantity, 0),
    [cartLines],
  );

  function getQuantityForVariety(varietyId: string) {
    return cartLinesByVarietyId[varietyId]?.quantity ?? 0;
  }

  function setQuantityForVariety(line: Omit<CartLine, "quantity">, quantity: number) {
    setCartLinesByVarietyId((currentLines) => {
      const nextLines = { ...currentLines };
      if (quantity <= 0) {
        delete nextLines[line.varietyId];
        return nextLines;
      }
      nextLines[line.varietyId] = { ...line, quantity };
      return nextLines;
    });
  }

  function removeLine(varietyId: string) {
    setCartLinesByVarietyId((currentLines) => {
      const nextLines = { ...currentLines };
      delete nextLines[varietyId];
      return nextLines;
    });
  }

  function clearCart() {
    setCartLinesByVarietyId({});
    setOrderForCustomerId(null);
    try {
      window.localStorage.removeItem(CART_LOCAL_STORAGE_KEY);
    } catch {}
  }

  return (
    <CartContext.Provider
      value={{
        cartLines,
        totalCartQuantity,
        getQuantityForVariety,
        setQuantityForVariety,
        removeLine,
        clearCart,
        orderForCustomerId,
        setOrderForCustomerId,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const cartContextValue = useContext(CartContext);
  if (!cartContextValue) throw new Error("useCart must be used within a CartProvider");
  return cartContextValue;
}
