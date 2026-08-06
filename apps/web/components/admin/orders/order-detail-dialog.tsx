"use client";

import { format } from "date-fns";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "~/components/ui/dialog";
import { useOrders } from "~/hooks/use-orders";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";

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
          <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <div className="rounded-2xl border bg-muted/30 p-3">
                <p className="text-sm font-medium">{orderDetail.customer.shopName}</p>
                {orderDetail.customer.contactName && (
                  <p className="text-xs text-muted-foreground">
                    {orderDetail.customer.contactName}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">{orderDetail.customer.phone}</p>
                <p className="text-xs text-muted-foreground">{orderDetail.customer.address}</p>
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
                    className="flex items-center justify-between rounded-xl border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.varietyName}</p>
                    </div>
                    <p className="font-medium">
                      {item.quantity} {item.unit}
                    </p>
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
