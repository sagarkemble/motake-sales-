import Link from "next/link";

import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import type { CartLine } from "~/providers/cart-provider";
import { CartItemRow } from "./cart-item-row";

interface CartViewDesktopProps {
  cartLines: CartLine[];
  totalCartQuantity: number;
  onQuantityChange: (cartLine: CartLine, quantity: number) => void;
  onRemove: (varietyId: string) => void;
}

export function CartViewDesktop({
  cartLines,
  totalCartQuantity,
  onQuantityChange,
  onRemove,
}: CartViewDesktopProps) {
  const tx = useTranslate();

  return (
    <div className="grid grid-cols-3 gap-6 px-6 py-6">
      <div className="col-span-2 flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {tx("salesman.cart.itemsInCart", { count: totalCartQuantity })}
        </p>
        {cartLines.map((cartLine) => (
          <CartItemRow
            key={cartLine.varietyId}
            cartLine={cartLine}
            onQuantityChange={(quantity) => onQuantityChange(cartLine, quantity)}
            onRemove={() => onRemove(cartLine.varietyId)}
          />
        ))}
      </div>

      <div className="col-span-1">
        <div className="sticky top-20 flex flex-col gap-3 rounded-2xl border bg-card shadow-sm p-4">
          <p className="text-sm font-medium">{tx("salesman.cart.orderSummary")}</p>
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{tx("salesman.checkout.success.totalItems")}</span>
            <span className="font-medium text-foreground">{totalCartQuantity}</span>
          </div>
          <Button
            asChild
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Link href="/salesman/cart/checkout">{tx("salesman.cart.proceed")}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
