"use client";

import { PackageIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";

import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import { useCart } from "~/providers/cart-provider";

export default function SalesmanCartPage() {
  const { cartLines, totalCartQuantity, setQuantityForVariety, removeLine } = useCart();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      {cartLines.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Your cart is empty. Go to Products and tap Add to Cart.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {totalCartQuantity} {totalCartQuantity === 1 ? "item" : "items"} in cart
          </p>

          <div className="flex flex-col gap-2">
            {cartLines.map((line) => (
              <div
                key={line.varietyId}
                className="flex items-center gap-3 rounded-2xl border bg-card p-3"
              >
                <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted/40">
                  {line.productImageUrl ? (
                    <img
                      src={line.productImageUrl}
                      alt={line.productName}
                      className="size-full object-cover"
                    />
                  ) : (
                    <PackageIcon className="size-5 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{line.productName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {line.varietyName} ({line.unit})
                  </p>
                </div>

                <QuantityStepper
                  quantity={line.quantity}
                  onQuantityChange={(quantity) =>
                    setQuantityForVariety(
                      {
                        varietyId: line.varietyId,
                        productId: line.productId,
                        productName: line.productName,
                        varietyName: line.varietyName,
                        unit: line.unit,
                        productImageUrl: line.productImageUrl,
                      },
                      quantity,
                    )
                  }
                />

                <button
                  type="button"
                  aria-label="Remove item"
                  onClick={() => removeLine(line.varietyId)}
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                >
                  <Trash2Icon className="size-4" />
                </button>
              </div>
            ))}
          </div>

          <Button
            asChild
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <Link href="/salesman/cart/checkout">Proceed to checkout</Link>
          </Button>
        </>
      )}
    </div>
  );
}
