import Link from "next/link";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import type { CartLine } from "~/providers/cart-provider";
import { CartItemRow } from "./cart-item-row";

interface CartViewMobileProps {
  cartLines: CartLine[];
  totalCartQuantity: number;
  onQuantityChange: (cartLine: CartLine, quantity: number) => void;
  onRemove: (varietyId: string) => void;
}

export function CartViewMobile({
  cartLines,
  totalCartQuantity,
  onQuantityChange,
  onRemove,
}: CartViewMobileProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-4 px-4 py-4 pb-28">
      <p className="text-sm text-muted-foreground">
        {totalCartQuantity} {totalCartQuantity === 1 ? "item" : "items"} in cart
      </p>

      <div className="flex flex-col gap-2">
        {cartLines.map((cartLine) => (
          <CartItemRow
            key={cartLine.varietyId}
            cartLine={cartLine}
            onQuantityChange={(quantity) => onQuantityChange(cartLine, quantity)}
            onRemove={() => onRemove(cartLine.varietyId)}
          />
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-30 border-t border-border bg-background px-4 py-3">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {tx("salesman.checkout.success.totalItems")}
          </span>
          <span className="font-semibold text-brand">{totalCartQuantity}</span>
        </div>
        <Button
          asChild
          className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/salesman/cart/checkout">Proceed to order</Link>
        </Button>
      </div>
    </div>
  );
}
