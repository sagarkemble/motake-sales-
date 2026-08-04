"use client";

import { MinusIcon, PlusIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
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
  function handleNumericInput(rawValue: string) {
    const parsedQuantity = Number.parseInt(rawValue, 10);
    onQuantityChange(
      Number.isNaN(parsedQuantity) ? minQuantity : Math.max(minQuantity, parsedQuantity),
    );
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
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-3.5" />
      </Button>

      <Input
        type="number"
        inputMode="numeric"
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
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-3.5" />
      </Button>
    </div>
  );
}
