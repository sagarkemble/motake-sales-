"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface QuantityStepperProps {
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  minQuantity?: number;
  className?: string;
}

export function QuantityStepper({
  quantity,
  onQuantityChange,
  minQuantity = 0,
  className,
}: QuantityStepperProps) {
  const tx = useTranslate();

  function handleNumericInput(rawValue: string) {
    const digitsOnly = rawValue.replace(/\D/g, "");
    const parsedQuantity = digitsOnly === "" ? minQuantity : Number.parseInt(digitsOnly, 10);
    onQuantityChange(Math.max(minQuantity, parsedQuantity));
  }

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        disabled={quantity <= minQuantity}
        onClick={() => onQuantityChange(Math.max(minQuantity, quantity - 1))}
        aria-label={tx("Decrease quantity")}
      >
        <MinusIcon className="size-3.5" />
      </Button>

      <Input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={quantity}
        onChange={(event) => handleNumericInput(event.target.value)}
        className="h-8 w-14 rounded-lg border-input px-1 text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-8 shrink-0 rounded-full"
        onClick={() => onQuantityChange(quantity + 1)}
        aria-label={tx("Increase quantity")}
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}
