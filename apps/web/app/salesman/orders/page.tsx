"use client";

import { format } from "date-fns";
import { ClipboardListIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useOrders } from "~/hooks/use-orders";

const ORDERS_PAGE_SIZE = 20;

export default function SalesmanOrdersPage() {
  const { ordersPage, isOrdersListLoading } = useOrders({
    listFilters: { page: 1, pageSize: ORDERS_PAGE_SIZE },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-4">
      {isOrdersListLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
      ) : ordersPage.items.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          You have not placed any orders yet.
        </p>
      ) : (
        ordersPage.items.map(({ order, customerShopName }) => (
          <div key={order.id} className="flex items-center gap-3 rounded-2xl border bg-card p-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
              <ClipboardListIcon className="size-5 text-muted-foreground" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{customerShopName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {order.orderCode} · {format(new Date(order.placedAt), "d MMM, h:mm a")} ·{" "}
                {order.totalQuantity} items
              </p>
            </div>

            <Badge variant="outline" className="shrink-0 capitalize">
              {order.status}
            </Badge>
          </div>
        ))
      )}
    </div>
  );
}
