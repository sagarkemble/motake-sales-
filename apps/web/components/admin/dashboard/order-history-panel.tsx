"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { InboxIcon } from "lucide-react";

import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ListItemSkeleton } from "~/components/admin/shared/list-item-skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useOrderHistory } from "~/hooks/use-order-history";

interface OrderHistoryPanelProps {
  salesmanId?: string;
  heading?: string;
}

export function OrderHistoryPanel({ salesmanId, heading = "Order history" }: OrderHistoryPanelProps = {}) {
  const { orderHistory, isOrderHistoryLoading, isLoadingMoreOrders, hasMoreOrders, loadMoreOrders } =
    useOrderHistory({ pageSize: 15, salesmanId });

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const sentinelElement = loadMoreSentinelRef.current;
    if (!sentinelElement) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreOrders();
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinelElement);
    return () => observer.disconnect();
  }, [loadMoreOrders]);

  return (
    <div className="flex flex-col gap-3 rounded-3xl border bg-card p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">{heading}</h2>
      </div>

      {isOrderHistoryLoading ? (
        <ListItemSkeleton count={5} />
      ) : orderHistory.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <InboxIcon className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No orders yet</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-border">
          {orderHistory.map(({ order, customerShopName, customerPhone, salesmanCode, salesmanName }) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className="flex items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{customerShopName}</p>
                  <OrderStatusBadge status={order.status} className="shrink-0" />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {order.orderCode}
                  {!salesmanId && ` · Salesman ${salesmanName ?? salesmanCode}`}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-medium">{order.totalQuantity} qty</p>
                <p className="text-xs text-muted-foreground">
                  {format(new Date(order.placedAt), "d MMM, h:mm a")}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {hasMoreOrders && (
        <div ref={loadMoreSentinelRef} className="flex justify-center py-2">
          {isLoadingMoreOrders && <Spinner className="size-4 text-muted-foreground" />}
        </div>
      )}

      <OrderDetailDialog
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
