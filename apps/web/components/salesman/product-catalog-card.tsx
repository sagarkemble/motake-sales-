"use client";

import { PackageIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useCart } from "~/providers/cart-provider";

interface ProductCatalogCardProps {
  productId: string;
  productName: string;
  productImageUrl: string | null;
  varietyCount: number;
  onAddToCart: () => void;
}

export function ProductCatalogCard({
  productId,
  productName,
  productImageUrl,
  varietyCount,
  onAddToCart,
}: ProductCatalogCardProps) {
  const { cartLines } = useCart();

  const quantityInCartForProduct = cartLines
    .filter((line) => line.productId === productId)
    .reduce((runningTotal, line) => runningTotal + line.quantity, 0);

  return (
    <div className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl bg-muted/40">
        {productImageUrl ? (
          <img src={productImageUrl} alt={productName} className="size-full object-contain p-2" />
        ) : (
          <div className="flex size-full items-center justify-center">
            <PackageIcon className="size-8 text-muted-foreground" />
          </div>
        )}
        {quantityInCartForProduct > 0 && (
          <span className="absolute right-2 top-2 flex min-w-6 items-center justify-center rounded-full bg-brand px-1.5 py-0.5 text-xs font-semibold text-brand-foreground">
            {quantityInCartForProduct} in cart
          </span>
        )}
      </div>

      <div className="flex-1">
        <p className="truncate text-sm font-medium">{productName}</p>
        <p className="text-xs text-muted-foreground">
          {varietyCount} {varietyCount === 1 ? "size" : "sizes"}
        </p>
      </div>

      <Button
        type="button"
        onClick={onAddToCart}
        className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      >
        Add to Cart
      </Button>
    </div>
  );
}
