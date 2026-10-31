"use client";

import { PackageIcon, PackageXIcon } from "lucide-react";

import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";
import { useCart } from "~/providers/cart-provider";

interface ProductVarietyOption {
  varietyId: string;
  sku: string;
  varietyName: string;
  /** What is left on the Active GatePass; undefined without one. More can still be added. */
  sellableQty?: number;
}

interface AddToCartDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  productImageUrl: string | null;
  varieties: ProductVarietyOption[];
}

export function AddToCartDrawer({
  open,
  onOpenChange,
  productId,
  productName,
  productImageUrl,
  varieties,
}: AddToCartDrawerProps) {
  const tx = useTranslate();
  const { getQuantityForVariety, setQuantityForVariety } = useCart();

  function handleQuantityChange(variety: ProductVarietyOption, quantity: number) {
    setQuantityForVariety(
      {
        varietyId: variety.varietyId,
        sku: variety.sku,
        productId,
        productName,
        varietyName: variety.varietyName,
        productImageUrl,
      },
      quantity,
    );
  }

  const selectedQuantity = varieties.reduce(
    (runningTotal, variety) => runningTotal + getQuantityForVariety(variety.varietyId),
    0,
  );

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
        <DrawerHeader className="flex flex-row items-center gap-3 text-left">
          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted-soft">
            {productImageUrl ? (
              <img
                src={productImageUrl}
                alt={productName}
                className="size-full object-contain p-1"
              />
            ) : (
              <PackageIcon className="size-6 text-muted-foreground" />
            )}
          </div>
          <DrawerTitle className="text-base">{productName}</DrawerTitle>
        </DrawerHeader>

        {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-3 px-4 pb-2">
            {varieties.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
                <PackageXIcon className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">{tx("salesman.catalog.noSizes")}</p>
              </div>
            ) : (
              varieties.map((variety) => (
                <div
                  key={variety.varietyId}
                  className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{variety.varietyName}</p>
                    {variety.sellableQty !== undefined && (
                      <p
                        className={cn(
                          "text-xs font-medium",
                          getQuantityForVariety(variety.varietyId) > variety.sellableQty
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-brand",
                        )}
                      >
                        {tx("salesman.catalog.inGatepass", { count: variety.sellableQty })}
                      </p>
                    )}
                  </div>
                  <QuantityStepper
                    quantity={getQuantityForVariety(variety.varietyId)}
                    onQuantityChange={(quantity) => handleQuantityChange(variety, quantity)}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>

        <DrawerFooter>
          {selectedQuantity > 0 && (
            <div className="mb-1 flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
              <span className="text-muted-foreground">{tx("salesman.catalog.selected")}</span>
              <span className="font-semibold text-brand">{selectedQuantity}</span>
            </div>
          )}
          <Button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {tx("checkout.success.done")}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
