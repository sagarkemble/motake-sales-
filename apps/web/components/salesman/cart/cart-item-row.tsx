"use client";

import { PackageIcon, Trash2Icon } from "lucide-react";

import { QuantityStepper } from "~/components/shared/quantity-stepper";
import type { CartLine } from "~/providers/cart-provider";

interface CartItemRowProps {
  cartLine: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}

export function CartItemRow({ cartLine, onQuantityChange, onRemove }: CartItemRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border bg-card p-3">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
        {cartLine.productImageUrl ? (
          <img
            src={cartLine.productImageUrl}
            alt={cartLine.productName}
            className="size-full object-cover"
          />
        ) : (
          <PackageIcon className="size-5 text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{cartLine.productName}</p>
        <p className="truncate text-xs text-muted-foreground">
          {cartLine.varietyName} ({cartLine.unit})
        </p>
      </div>

      <QuantityStepper quantity={cartLine.quantity} onQuantityChange={onQuantityChange} />

      <button
        type="button"
        aria-label="Remove item"
        onClick={onRemove}
        className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  );
}
