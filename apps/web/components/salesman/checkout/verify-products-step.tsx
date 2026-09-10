"use client";

import { CartItemRow } from "~/components/salesman/cart/cart-item-row";
import { useTranslate } from "~/hooks/use-translate";
import { formatInr } from "~/lib/format-money";
import type { CartLine } from "~/providers/cart-provider";

interface VerifyProductsStepProps {
  cartLines: CartLine[];
  totalCartQuantity: number;
  totalCartAmount: number;
  onQuantityChange: (cartLine: CartLine, quantity: number) => void;
  onRemove: (varietyId: string) => void;
}

export function VerifyProductsStep({
  cartLines,
  totalCartQuantity,
  totalCartAmount,
  onQuantityChange,
  onRemove,
}: VerifyProductsStepProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("salesman.checkout.steps.verifyProducts")}</p>
        <p className="text-sm text-muted-foreground">
          Check your products and quantities before proceeding.
        </p>
      </div>

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

      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          Total items <span className="font-medium text-foreground">{totalCartQuantity}</span>
        </span>
        <span className="font-semibold text-brand">{formatInr(totalCartAmount)}</span>
      </div>
    </div>
  );
}
