"use client";

import { CheckIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import type { PlacedOrder } from "~/hooks/salesman/use-checkout-wizard";

interface OrderSuccessStepProps {
  placedOrder: PlacedOrder;
  onViewOrders: () => void;
  onBackToHome: () => void;
}

const ORDER_TYPE_LABELS: Record<PlacedOrder["type"], string> = {
  book_now: "Order",
  pre_order: "Pre-order",
};

export function OrderSuccessStep({
  placedOrder,
  onViewOrders,
  onBackToHome,
}: OrderSuccessStepProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatInr } = useFormatMoney();

  return (
    <div className="flex flex-col items-center gap-6 px-4 py-10 text-center">
      <span className="flex size-20 items-center justify-center rounded-full bg-brand/10 text-brand">
        <CheckIcon className="size-10" />
      </span>

      <div>
        <p className="text-lg font-semibold">{tx("Order placed successfully!")}</p>
        <p className="text-sm text-muted-foreground">{tx("Your order has been placed.")}</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3 rounded-2xl border bg-card p-4 text-left">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tx("Order ID")}</p>
          <p className="text-sm font-medium">{placedOrder.orderCode}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tx("Total items")}</p>
          <p className="text-sm font-medium">{placedOrder.totalQuantity}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tx("Total amount")}</p>
          <p className="text-sm font-semibold text-brand">{formatInr(placedOrder.totalAmount)}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tx("Order type")}</p>
          <p className="text-sm font-medium">{tx(ORDER_TYPE_LABELS[placedOrder.type])}</p>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">{tx("Order time")}</p>
          <p className="text-sm font-medium">
            {formatDate(placedOrder.placedAt, "d MMM yyyy, h:mm a")}
          </p>
        </div>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-2">
        <Button
          type="button"
          onClick={onViewOrders}
          className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {tx("View my orders")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onBackToHome}
          className="w-full rounded-full"
        >
          {tx("Back to home")}
        </Button>
      </div>
    </div>
  );
}
