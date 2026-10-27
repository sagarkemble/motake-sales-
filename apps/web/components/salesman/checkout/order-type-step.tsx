"use client";

import { AlertTriangleIcon, CalendarClockIcon, HandCoinsIcon } from "lucide-react";
import { format, parseISO } from "date-fns";
import { useId } from "react";

import { Calendar } from "~/components/ui/calendar";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import type { BookNowBlockReason, OrderTypeChoice } from "~/hooks/salesman/use-checkout-wizard";
import { cn } from "~/lib/utils";

interface OrderTypeStepProps {
  orderType: OrderTypeChoice;
  onOrderTypeChange: (orderType: OrderTypeChoice) => void;
  isBookNowAllowed: boolean;
  bookNowBlockReasons: BookNowBlockReason[];
  scheduledDate: string;
  onScheduledDateChange: (scheduledDate: string) => void;
  // The first day a Pre-order may be for (tomorrow); there is no last day.
  earliestDate: string;
}

export function OrderTypeStep({
  orderType,
  onOrderTypeChange,
  isBookNowAllowed,
  bookNowBlockReasons,
  scheduledDate,
  onScheduledDateChange,
  earliestDate,
}: OrderTypeStepProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  // The checkout mounts a mobile and a desktop tree; ids must differ between them.
  const idPrefix = useId();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("salesman.checkout.orderType.title")}</p>
        <p className="text-sm text-muted-foreground">{tx("salesman.checkout.orderType.hint")}</p>
      </div>

      <RadioGroup
        value={orderType}
        onValueChange={(value) => onOrderTypeChange(value as OrderTypeChoice)}
        className="gap-3"
      >
        <Label
          htmlFor={`${idPrefix}-order-type-book-now`}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 font-normal",
            orderType === "book_now" ? "border-brand bg-accent/50" : "bg-card",
            !isBookNowAllowed && "opacity-70",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <HandCoinsIcon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">
              {tx("salesman.checkout.orderType.orderLabel")}
            </span>
            <span className="text-xs text-muted-foreground">
              {tx("salesman.checkout.orderType.deliverNowHint")}
            </span>
            {!isBookNowAllowed && (
              <span className="mt-2 flex flex-col gap-0.5 rounded-lg bg-destructive/10 p-2">
                {bookNowBlockReasons.map((reason) => (
                  <span
                    key={`${reason.key}-${String(reason.values?.name ?? "")}`}
                    className="flex items-start gap-1 text-xs text-destructive"
                  >
                    <AlertTriangleIcon className="mt-0.5 size-3 shrink-0" />
                    {tx(reason.key, reason.values)}
                  </span>
                ))}
              </span>
            )}
          </span>
          <RadioGroupItem
            id={`${idPrefix}-order-type-book-now`}
            value="book_now"
            disabled={!isBookNowAllowed}
          />
        </Label>

        <Label
          htmlFor={`${idPrefix}-order-type-pre-order`}
          className={cn(
            "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 font-normal",
            orderType === "pre_order" ? "border-brand bg-accent/50" : "bg-card",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
            <CalendarClockIcon className="size-4" />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium">
              {tx("salesman.checkout.orderType.preOrder")}
            </span>
            <span className="text-xs text-muted-foreground">
              {tx("salesman.checkout.orderType.preOrderHint", {
                date: formatDate(scheduledDate, "EEE, d MMM yyyy"),
              })}
            </span>
          </span>
          <RadioGroupItem id={`${idPrefix}-order-type-pre-order`} value="pre_order" />
        </Label>
      </RadioGroup>

      {orderType === "pre_order" && (
        <div className="flex flex-col items-center gap-1 rounded-2xl border bg-card p-2">
          <p className="self-start px-2 pt-1 text-xs font-medium">
            {tx("salesman.checkout.orderType.deliveryDate")}
          </p>
          <Calendar
            mode="single"
            required
            selected={parseISO(scheduledDate)}
            onSelect={(date) => date && onScheduledDateChange(format(date, "yyyy-MM-dd"))}
            disabled={{ before: parseISO(earliestDate) }}
            defaultMonth={parseISO(scheduledDate)}
          />
          <p className="px-2 pb-1 text-[11px] text-muted-foreground">
            {tx("salesman.checkout.orderType.dateHint")}
          </p>
        </div>
      )}
    </div>
  );
}
