"use client";

import { useEffect, useRef, useState } from "react";

import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { OrderItemAvatars } from "~/components/shared/order-item-avatars";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useOrderHistory } from "~/hooks/use-order-history";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

interface OrderHistoryPanelProps {
  salesmanId?: string;
  heading?: string;
}

export function OrderHistoryPanel({ salesmanId, heading }: OrderHistoryPanelProps = {}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const {
    orderHistory,
    isOrderHistoryLoading,
    isLoadingMoreOrders,
    hasMoreOrders,
    loadMoreOrders,
    refetchOrderHistory,
    isOrderHistoryFetching,
  } = useOrderHistory({ pageSize: 15, salesmanId });
  usePageRefresh(refetchOrderHistory, isOrderHistoryFetching);
  const isReloading = usePageReloading();

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
    <div className="flex flex-col gap-3 rounded-2xl border bg-card shadow-sm p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          {heading ?? tx("admin.dashboard.orderHistory")}
        </h2>
      </div>

      {isOrderHistoryLoading || (isReloading && isOrderHistoryFetching) ? (
        <ListItemSkeleton count={5} />
      ) : orderHistory.length === 0 ? (
        <EmptyStateCard
          compact
          title={tx("empty.dashboardOrders.title")}
          body={tx("empty.dashboardOrders.body")}
          action={{ label: tx("empty.actions.newOrder"), href: "/admin/orders/new" }}
        />
      ) : (
        // Rows reach a little past the heading's edge so their hover box has room inside.
        <div className="-mx-2 flex flex-col gap-1">
          {orderHistory.map(
            ({
              id,
              type,
              status,
              totalQuantity,
              placedAt,
              customerShopName,
              customerPhone,
              customerShopPhotoUrl,
              salesmanCode,
              salesmanName,
              itemPreviews,
            }) => (
              <button
                key={id}
                type="button"
                onClick={() => setSelectedOrderId(id)}
                className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <ShopPhotoThumbnail
                    shopPhotoUrl={customerShopPhotoUrl}
                    shopName={customerShopName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{customerShopName}</p>
                      <OrderStatusBadge status={status} className="shrink-0" />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {type === "pre_order"
                        ? tx("common.orderType.preOrder")
                        : tx("common.orderType.bookNow")}
                      {!salesmanId &&
                        ` · ${tx("admin.dashboard.salesmanPrefix", { name: salesmanName ?? salesmanCode ?? "" })}`}
                      {customerPhone ? ` · ${customerPhone}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">
                      {totalQuantity} {tx("common.units.qty")}
                    </p>
                    <OrderItemAvatars itemPreviews={itemPreviews} size="sm" />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(new Date(placedAt), "d MMM, h:mm a")}
                  </p>
                </div>
              </button>
            ),
          )}
        </div>
      )}

      {hasMoreOrders && (
        <div ref={loadMoreSentinelRef} className="flex flex-col gap-3 py-2">
          {isLoadingMoreOrders && (
            <div className="flex items-center gap-3">
              <Skeleton className="size-8 shrink-0 rounded-full" />
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-2.5 w-1/3" />
              </div>
            </div>
          )}
        </div>
      )}

      <OrderDetailDialog
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}
