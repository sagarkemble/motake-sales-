"use client";

import { PackageIcon, Trash2Icon } from "lucide-react";

import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";
import type { CartLine } from "~/providers/cart-provider";

interface CartItemRowProps {
  cartLine: CartLine;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
  // Checkout: the server's price line, or why the line cannot be sold.
  footer?: React.ReactNode;
  tone?: "default" | "bad" | "short";
}

export function CartItemRow({
  cartLine,
  onQuantityChange,
  onRemove,
  footer,
  tone = "default",
}: CartItemRowProps) {
  const tx = useTranslate();

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-2xl border bg-card p-3",
        tone === "bad" && "border-destructive/50 bg-destructive/5",
        tone === "short" && "border-amber-500/50",
      )}
    >
      <div className="flex items-center gap-3">
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

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={tx("common.a11y.removeItem")}
          onClick={onRemove}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2Icon className="size-4" />
        </Button>
      </div>
      {footer}
    </div>
  );
}
