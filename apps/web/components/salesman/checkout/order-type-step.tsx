import { format } from "date-fns";
import { AlertTriangleIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { OrderTypeChoice } from "~/hooks/salesman/use-checkout-wizard";

interface OrderTypeStepProps {
  orderType: OrderTypeChoice;
  onOrderTypeChange: (orderType: OrderTypeChoice) => void;
  isBookNowAllowed: boolean;
  bookNowBlockReasons: string[];
  nextDayDate: Date;
}

export function OrderTypeStep({
  orderType,
  onOrderTypeChange,
  isBookNowAllowed,
  bookNowBlockReasons,
  nextDayDate,
}: OrderTypeStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">Order type</p>
        <p className="text-sm text-muted-foreground">Select the type of order.</p>
      </div>

      <button
        type="button"
        disabled={!isBookNowAllowed}
        onClick={() => onOrderTypeChange("book_now")}
        className={cn(
          "flex flex-col gap-1 rounded-2xl border p-4 text-left transition-colors",
          orderType === "book_now" ? "border-brand bg-brand/5" : "border-border bg-card",
          !isBookNowAllowed && "opacity-50",
        )}
      >
        <p className="text-sm font-medium">Normal order</p>
        <p className="text-xs text-muted-foreground">
          Deliver now and collect payment from customer.
        </p>
        {!isBookNowAllowed && (
          <div className="mt-1 flex flex-col gap-0.5 rounded-lg bg-destructive/10 p-2">
            {bookNowBlockReasons.map((reason) => (
              <p key={reason} className="flex items-start gap-1 text-xs text-destructive">
                <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                {reason}
              </p>
            ))}
          </div>
        )}
      </button>

      <button
        type="button"
        onClick={() => onOrderTypeChange("pre_order")}
        className={cn(
          "flex flex-col gap-1 rounded-2xl border p-4 text-left transition-colors",
          orderType === "pre_order" ? "border-brand bg-brand/5" : "border-border bg-card",
        )}
      >
        <p className="text-sm font-medium">Pre-order (tomorrow)</p>
        <p className="text-xs text-muted-foreground">
          Order will be delivered {format(nextDayDate, "d MMM yyyy")}. Does not use gate pass.
        </p>
      </button>
    </div>
  );
}
