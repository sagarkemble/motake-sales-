"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useTranslate } from "~/hooks/use-translate";
import { INDIAN_STATES, type IndianStateName } from "@repo/trpc/client";
import { cn } from "~/lib/utils";

interface DeliveryStateSelectProps {
  id?: string;
  value: IndianStateName | "";
  disabled?: boolean;
  className?: string;
  onValueChange: (deliveryState: IndianStateName) => void;
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
      onValueChange={(nextValue) => onValueChange(nextValue as IndianStateName)}
    >
      <SelectTrigger id={id} className={cn("w-full rounded-xl bg-muted-soft", className)}>
        <SelectValue placeholder={tx("admin.routes.deliveryStatePlaceholder")} />
      </SelectTrigger>
      <SelectContent>
        {INDIAN_STATES.map(({ name: deliveryState }) => (
          <SelectItem key={deliveryState} value={deliveryState}>
            {deliveryState}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
