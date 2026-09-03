"use client";

import { format } from "date-fns";
import { PackageIcon } from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useOrders } from "~/hooks/use-orders";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { formatInr, lineTotal } from "~/lib/format-money";

interface OrderDetailDialogProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ orderId, onOpenChange }: OrderDetailDialogProps) {
  const { orderDetail, isOrderDetailLoading } = useOrders({ detailOrderId: orderId ?? undefined });

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {orderDetail ? (
              <>
                {orderDetail.order.orderCode}
                <OrderStatusBadge status={orderDetail.order.status} />
              </>
            ) : (
              "Order details"
            )}
          </DialogTitle>
        </DialogHeader>

        {isOrderDetailLoading || !orderDetail ? (
          <CardDetailSkeleton />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 rounded-2xl border bg-muted/30 p-3">
                <ShopPhotoThumbnail
                  shopPhotoUrl={orderDetail.customer.shopPhotoUrl}
                  shopName={orderDetail.customer.shopName}
                  size="md"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{orderDetail.customer.shopName}</p>
                  {orderDetail.customer.contactName && (
                    <p className="text-xs text-muted-foreground">
                      {orderDetail.customer.contactName}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{orderDetail.customer.phone}</p>
                  <p className="text-xs text-muted-foreground">{orderDetail.customer.address}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Salesman</p>
                  <p className="font-medium">{orderDetail.salesmanName ?? orderDetail.salesmanCode}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total quantity</p>
                  <p className="font-medium">{orderDetail.order.totalQuantity}</p>
                </div>
                <div className="col-span-2 rounded-xl bg-brand/5 p-3">
                  <p className="text-xs text-muted-foreground">Total amount</p>
                  <p className="text-lg font-semibold text-brand">
                    {formatInr(orderDetail.order.totalAmount)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Placed at</p>
                  <p className="font-medium">
                    {format(new Date(orderDetail.order.placedAt), "d MMM yyyy, h:mm a")}
                  </p>
                </div>
                {orderDetail.order.scheduledDate && (
                  <div>
                    <p className="text-xs text-muted-foreground">Scheduled for</p>
                    <p className="font-medium">
                      {format(new Date(orderDetail.order.scheduledDate), "d MMM yyyy")}
                    </p>
                  </div>
                )}
                {orderDetail.order.fulfilledAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Fulfilled at</p>
                    <p className="font-medium">
                      {format(new Date(orderDetail.order.fulfilledAt), "d MMM yyyy, h:mm a")}
                    </p>
                  </div>
                )}
                {orderDetail.order.fulfilledAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Fulfilled by</p>
                    <p className="font-medium">{orderDetail.fulfilledBySalesmanName ?? "—"}</p>
                  </div>
                )}
                {orderDetail.order.cancelledAt && (
                  <div>
                    <p className="text-xs text-muted-foreground">Cancelled at</p>
                    <p className="font-medium">
                      {format(new Date(orderDetail.order.cancelledAt), "d MMM yyyy, h:mm a")}
                    </p>
                  </div>
                )}
              </div>

              {orderDetail.order.notes && (
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm">{orderDetail.order.notes}</p>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <p className="text-xs text-muted-foreground">Items</p>
                {orderDetail.items.map((item) => (
                  <div
                    key={item.varietyId}
                    className="flex items-center gap-3 rounded-xl border p-3 text-sm"
                  >
                    <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={item.productName}
                          className="size-full object-cover"
                        />
                      ) : (
                        <PackageIcon className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.productName}</p>
                      <p className="truncate text-xs text-muted-foreground">{item.varietyName}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                        <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm font-semibold text-brand">
                          {item.quantity}
                        </span>
                        <span className="text-xs text-muted-foreground">× {item.unit}</span>
                      </p>
                      <p className="mt-1 text-xs font-medium text-brand">
                        {formatInr(lineTotal(item.unitPrice, item.quantity))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
