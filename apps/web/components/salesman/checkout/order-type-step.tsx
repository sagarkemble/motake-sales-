import { format } from "date-fns";
import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  HandCoinsIcon,
} from "lucide-react";

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
        aria-pressed={orderType === "book_now"}
        onClick={() => onOrderTypeChange("book_now")}
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
          orderType === "book_now" ? "border-brand bg-brand/5" : "border-border bg-card",
          !isBookNowAllowed && "opacity-50",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <HandCoinsIcon className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Order</p>
          <p className="text-xs text-muted-foreground">
            Deliver now and collect payment from customer.
          </p>
          {!isBookNowAllowed && (
            <div className="mt-2 flex flex-col gap-0.5 rounded-lg bg-destructive/10 p-2">
              {bookNowBlockReasons.map((reason) => (
                <p key={reason} className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                  {reason}
                </p>
              ))}
            </div>
          )}
        </div>
        {orderType === "book_now" && <CheckCircle2Icon className="size-5 shrink-0 text-brand" />}
      </button>

      <button
        type="button"
        aria-pressed={orderType === "pre_order"}
        onClick={() => onOrderTypeChange("pre_order")}
        className={cn(
          "flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors",
          orderType === "pre_order" ? "border-brand bg-brand/5" : "border-border bg-card",
        )}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
          <CalendarClockIcon className="size-4" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-medium">Pre-order (tomorrow)</p>
          <p className="text-xs text-muted-foreground">
            Order will be delivered {format(nextDayDate, "d MMM yyyy")}. Does not use gate pass.
          </p>
        </div>
        {orderType === "pre_order" && <CheckCircle2Icon className="size-5 shrink-0 text-brand" />}
      </button>
    </div>
  );
}
