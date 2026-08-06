import { CartItemRow } from "~/components/salesman/cart/cart-item-row";
import type { CartLine } from "~/providers/cart-provider";

interface VerifyProductsStepProps {
  cartLines: CartLine[];
  totalCartQuantity: number;
  onQuantityChange: (cartLine: CartLine, quantity: number) => void;
  onRemove: (varietyId: string) => void;
}

export function VerifyProductsStep({
  cartLines,
  totalCartQuantity,
  onQuantityChange,
  onRemove,
}: VerifyProductsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">Verify products</p>
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

      <p className="text-sm text-muted-foreground">
        Total items <span className="font-medium text-foreground">{totalCartQuantity}</span>
      </p>
    </div>
  );
}
