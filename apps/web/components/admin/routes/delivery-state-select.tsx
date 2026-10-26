"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useTranslate } from "~/hooks/use-translate";
import { DELIVERY_STATES, type DeliveryState } from "~/lib/delivery-states";
import { cn } from "~/lib/utils";

interface DeliveryStateSelectProps {
  id?: string;
  value: DeliveryState | "";
  disabled?: boolean;
  className?: string;
  onValueChange: (deliveryState: DeliveryState) => void;
}

/** Indian states and union territories by full official name. */
export function DeliveryStateSelect({
  id,
  value,
  disabled,
  className,
  onValueChange,
}: DeliveryStateSelectProps) {
  const tx = useTranslate();

  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={(nextValue) => onValueChange(nextValue as DeliveryState)}
    >
      <SelectTrigger id={id} className={cn("w-full rounded-full bg-muted/40", className)}>
        <SelectValue placeholder={tx("admin.routes.deliveryStatePlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {DELIVERY_STATES.map((deliveryState) => (
          <SelectItem key={deliveryState} value={deliveryState}>
            {deliveryState}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
