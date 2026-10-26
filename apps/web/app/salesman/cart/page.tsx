"use client";

import { CartEmptyState } from "~/components/salesman/cart/cart-empty-state";
import { CartViewDesktop } from "~/components/salesman/cart/cart-view.desktop";
import { CartViewMobile } from "~/components/salesman/cart/cart-view.mobile";
import type { CartLine } from "~/providers/cart-provider";
import { useCart } from "~/providers/cart-provider";

export default function SalesmanCartPage() {
  const { cartLines, totalCartQuantity, setQuantityForVariety, removeLine } = useCart();

  if (cartLines.length === 0) {
    return <CartEmptyState />;
  }

  function handleQuantityChange(cartLine: CartLine, quantity: number) {
    setQuantityForVariety(
      {
        varietyId: cartLine.varietyId,
        sku: cartLine.sku,
        productId: cartLine.productId,
        productName: cartLine.productName,
        varietyName: cartLine.varietyName,
        unit: cartLine.unit,
        productImageUrl: cartLine.productImageUrl,
      },
      quantity,
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="md:hidden">
        <CartViewMobile
          cartLines={cartLines}
          totalCartQuantity={totalCartQuantity}
          onQuantityChange={handleQuantityChange}
          onRemove={removeLine}
        />
      </div>
      <div className="hidden md:block">
        <CartViewDesktop
          cartLines={cartLines}
          totalCartQuantity={totalCartQuantity}
          onQuantityChange={handleQuantityChange}
          onRemove={removeLine}
        />
      </div>
    </div>
  );
}
