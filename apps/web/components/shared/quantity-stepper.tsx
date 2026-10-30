"use client";

import { MAX_QTY } from "@repo/trpc/client";
import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface QuantityStepperProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  minQuantity?: number;
  // "+" stops here and a typed qty is held to it; 5,000 unless a screen needs less.
  maxQuantity?: number;
  disabled?: boolean;
  className?: string;
}

export function QuantityStepper({
  quantity,
  onQuantityChange,
  minQuantity = 0,
  maxQuantity = MAX_QTY,
  disabled = false,
  className,
}: QuantityStepperProps) {
  const tx = useTranslate();

  function handleNumericInput(rawValue: string) {
    const digitsOnly = rawValue.replace(/\D/g, "");
    const parsedQuantity = digitsOnly === "" ? minQuantity : Number.parseInt(digitsOnly, 10);
    onQuantityChange(Math.min(maxQuantity, Math.max(minQuantity, parsedQuantity)));
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        disabled={disabled || quantity <= minQuantity}
        onClick={() => onQuantityChange(Math.max(minQuantity, quantity - 1))}
        aria-label={tx("common.a11y.decreaseQty")}
      >
        <MinusIcon className="size-3.5" />
      </Button>

      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={quantity}
        disabled={disabled}
        onChange={(event) => handleNumericInput(event.target.value)}
        className="h-8 w-14 rounded-lg border-input px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        disabled={disabled || quantity >= maxQuantity}
        onClick={() => onQuantityChange(Math.min(maxQuantity, quantity + 1))}
        aria-label={tx("common.a11y.increaseQty")}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}
