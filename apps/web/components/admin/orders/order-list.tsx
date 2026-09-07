"use client";

import { useState } from "react";

import { Button } from "~/components/ui/button";
import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { OrderItemAvatars } from "~/components/shared/order-item-avatars";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";

interface OrderListProps {
  orderType?: "book_now" | "pre_order";
  customerId?: string;
}

export function OrderList({ orderType, customerId }: OrderListProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatInrCompact } = useFormatMoney();
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
        <p className="py-8 text-center text-sm text-muted-foreground">{tx("No orders yet")}</p>
      ) : (
        ordersPage.items.map(
          ({
            order,
            customerShopName,
            customerPhone,
            customerShopPhotoUrl,
            salesmanCode,
            salesmanName,
            itemPreviews,
          }) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedOrderId(order.id)}
              className="flex flex-col gap-2 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <OrderItemAvatars itemPreviews={itemPreviews} />
                  <p className="truncate text-sm font-medium">{order.orderCode}</p>
                </div>
                <OrderStatusBadge status={order.status} className="shrink-0" />
              </div>

              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ShopPhotoThumbnail
                    shopPhotoUrl={customerShopPhotoUrl}
                    shopName={customerShopName}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="truncate text-sm">{customerShopName}</p>
                    <p className="truncate text-xs text-muted-foreground">{customerPhone}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-brand">
                    {formatInrCompact(order.totalAmount)}
                  </p>
                  <p className="text-xs font-bold text-muted-foreground">
                    {order.totalQuantity} {tx("qty")}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="min-w-0 truncate">
                  {tx("Salesman")} {salesmanName ?? salesmanCode}
                </span>
                <span>
                  {formatDate(
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
