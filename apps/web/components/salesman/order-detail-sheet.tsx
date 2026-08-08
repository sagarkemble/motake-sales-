"use client";

import { format } from "date-fns";
import { useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import { Drawer, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { useOrders } from "~/hooks/use-orders";

interface OrderDetailSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailSheet({ orderId, onOpenChange }: OrderDetailSheetProps) {
  const [isConfirmingFulfil, setIsConfirmingFulfil] = useState(false);

  const { orderDetail, isOrderDetailLoading, refetchOrderDetail, fulfillOrderAsync, isFulfillingOrder } = useOrders({
    detailOrderId: orderId ?? undefined,
  });

  const isFulfillable =
    orderDetail?.order.type === "pre_order" &&
    orderDetail.order.status !== "fulfilled" &&
    orderDetail.order.status !== "cancelled";

  async function handleConfirmFulfil() {
    if (!orderId) return;
    try {
      await fulfillOrderAsync({ id: orderId });
      toast.success("Order marked as fulfilled");
    } catch (fulfilOrderError) {
      const errorMessage =
        fulfilOrderError instanceof Error ? fulfilOrderError.message : "Could not fulfil order";
      toast.error(errorMessage);
    } finally {
      setIsConfirmingFulfil(false);
    }
  }

  return (
    <>
      <Drawer open={Boolean(orderId)} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              {orderDetail ? (
                <>
                  {orderDetail.order.orderCode}
                  <OrderStatusBadge status={orderDetail.order.status} />
                </>
              ) : (
                "Order details"
              )}
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-4 pb-4">
            {isOrderDetailLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
            ) : !orderDetail ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">Could not load order details</p>
                <Button type="button" variant="outline" onClick={() => refetchOrderDetail()}>
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border bg-muted/30 p-3">
                  <p className="text-sm font-medium">{orderDetail.customer.shopName}</p>
                  {orderDetail.customer.contactName && (
                    <p className="text-xs text-muted-foreground">{orderDetail.customer.contactName}</p>
                  )}
                  <p className="text-xs text-muted-foreground">{orderDetail.customer.phone}</p>
                  <p className="text-xs text-muted-foreground">{orderDetail.customer.address}</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Issued by</p>
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
                  {orderDetail.order.fulfilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Fulfilled by</p>
                      <p className="font-medium">{orderDetail.fulfilledBySalesmanName ?? "—"}</p>
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
                      <p className="flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm font-semibold text-brand">
                          {item.quantity}
                        </span>
                        <span className="text-xs text-muted-foreground">× {item.unit}</span>
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {isFulfillable && (
            <DrawerFooter>
              <Button
                type="button"
                disabled={isFulfillingOrder}
                onClick={() => setIsConfirmingFulfil(true)}
                className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {isFulfillingOrder ? "Marking as fulfilled..." : "Mark as fulfilled"}
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      <AlertDialog open={isConfirmingFulfil} onOpenChange={setIsConfirmingFulfil}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this order as fulfilled?</AlertDialogTitle>
            <AlertDialogDescription>
              This confirms the customer has received the order. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isFulfillingOrder}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isFulfillingOrder} onClick={handleConfirmFulfil}>
              {isFulfillingOrder ? "Confirming..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
