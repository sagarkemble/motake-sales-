"use client";

import { useState } from "react";
import { format } from "date-fns";

import { Button } from "~/components/ui/button";
import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ListItemSkeleton } from "~/components/admin/shared/list-item-skeleton";
import { useOrders } from "~/hooks/use-orders";

interface OrderListProps {
  orderType?: "book_now" | "pre_order";
  customerId?: string;
}

export function OrderList({ orderType, customerId }: OrderListProps) {
  const [page, setPage] = useState(1);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const pageSize = 20;

  const { ordersPage, isOrdersListLoading } = useOrders({
    listFilters: { type: orderType, customerId, page, pageSize },
  });

  return (
    <div className="flex flex-col gap-3">
      {isOrdersListLoading ? (
        <ListItemSkeleton count={5} />
      ) : ordersPage.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No orders yet</p>
      ) : (
        ordersPage.items.map(
          ({ order, customerShopName, customerPhone, salesmanCode, salesmanName }) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">{order.orderCode}</p>
                <OrderStatusBadge status={order.status} />
              </div>
              <div>
                <p className="text-sm">{customerShopName}</p>
                <p className="text-xs text-muted-foreground">{customerPhone}</p>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Salesman {salesmanName ?? salesmanCode}</span>
                <span>{order.totalQuantity} qty</span>
                <span>
                  {format(
                    new Date(
                      orderType === "pre_order" && order.scheduledDate
                        ? order.scheduledDate
                        : order.placedAt,
                    ),
                    "d MMM yyyy",
                  )}
                </span>
              </div>
            </button>
          ),
        )
      )}

      {ordersPage.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {ordersPage.page} of {ordersPage.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={ordersPage.page <= 1}
              onClick={() => setPage((currentPage) => currentPage - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={ordersPage.page >= ordersPage.totalPages}
              onClick={() => setPage((currentPage) => currentPage + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      <OrderDetailDialog
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
