"use client";

import {
  AlertTriangleIcon,
  CalendarClockIcon,
  CheckCircle2Icon,
  HandCoinsIcon,
} from "lucide-react";

import { cn } from "~/lib/utils";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import type { OrderTypeChoice } from "~/hooks/salesman/use-checkout-wizard";

interface OrderTypeStepProps {
  orderType: OrderTypeChoice;
  onOrderTypeChange: (orderType: OrderTypeChoice) => void;
  isBookNowAllowed: boolean;
  bookNowBlockReasons: string[];
  nextDayDate: Date;
  totalCartAmount: number;
}

export function OrderTypeStep({
  orderType,
  onOrderTypeChange,
  isBookNowAllowed,
  bookNowBlockReasons,
  nextDayDate,
  totalCartAmount,
}: OrderTypeStepProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatInr } = useFormatMoney();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("Order type")}</p>
        <p className="text-sm text-muted-foreground">{tx("Select the type of order.")}</p>
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
          <p className="text-sm font-medium">{tx("Order")}</p>
          <p className="text-xs text-muted-foreground">
            {tx("Deliver now and collect payment from customer.")}
          </p>
          {!isBookNowAllowed && (
            <div className="mt-2 flex flex-col gap-0.5 rounded-lg bg-destructive/10 p-2">
              {bookNowBlockReasons.map((reason) => (
                <p key={reason} className="flex items-start gap-1 text-xs text-destructive">
                  <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                  {tx(reason)}
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
          <p className="text-sm font-medium">{tx("Pre-order (tomorrow)")}</p>
          <p className="text-xs text-muted-foreground">
            {tx("Order will be delivered {date}. Does not use gate pass.", {
              date: formatDate(nextDayDate, "d MMM yyyy"),
            })}
          </p>
        </div>
        {orderType === "pre_order" && <CheckCircle2Icon className="size-5 shrink-0 text-brand" />}
      </button>

      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{tx("Amount to collect")}</span>
        <span className="font-semibold text-brand">{formatInr(totalCartAmount)}</span>
      </div>
    </div>
  );
}
