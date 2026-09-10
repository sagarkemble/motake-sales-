"use client";

import { Badge } from "~/components/ui/badge";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

type OrderStatus = "confirmed" | "scheduled" | "due" | "fulfilled" | "cancelled";

interface OrderStatusBadgeProps {
  status: OrderStatus;
  className?: string;
}

const orderStatusLabels: Record<OrderStatus, string> = {
  confirmed: "common.orderStatus.confirmed",
  scheduled: "common.orderStatus.scheduled",
  due: "common.orderStatus.due",
  fulfilled: "common.orderStatus.fulfilled",
  cancelled: "common.orderStatus.cancelled",
};

const orderStatusStyles: Record<OrderStatus, string> = {
  confirmed: "border-transparent bg-blue-500/10 text-blue-600",
  scheduled: "border-transparent bg-muted text-muted-foreground",
  due: "border-transparent bg-amber-500/10 text-amber-600",
  fulfilled: "border-transparent bg-brand/10 text-brand",
  cancelled: "border-transparent bg-destructive/10 text-destructive",
};

export function OrderStatusBadge({ status, className }: OrderStatusBadgeProps) {
  const tx = useTranslate();

  return (
    <Badge
      variant="outline"
      className={cn("max-w-[7.5rem] truncate", orderStatusStyles[status], className)}
      title={tx(orderStatusLabels[status])}
    >
      {tx(orderStatusLabels[status])}
    </Badge>
  );
}
