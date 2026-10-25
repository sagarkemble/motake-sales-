"use client";

import { PackageIcon } from "lucide-react";
import { useEffect, useState } from "react";
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
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { GstRate } from "~/components/shared/gst-rate";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { OrderBillLines } from "~/components/salesman/order-bill-lines";
import { useOrderBill } from "~/hooks/salesman/use-order-bill";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { cn } from "~/lib/utils";

interface OrderDetailSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailSheet({ orderId, onOpenChange }: OrderDetailSheetProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const [isConfirmingFulfil, setIsConfirmingFulfil] = useState(false);
  const [isShowingBillLines, setIsShowingBillLines] = useState(false);

  const {
    orderDetail,
    isOrderDetailLoading,
    refetchOrderDetail,
    fulfillOrderAsync,
    isFulfillingOrder,
  } = useOrders({
    detailOrderId: orderId ?? undefined,
  });
  // The full Bill loads only once the salesman asks for its lines.
  const { orderBill, isOrderBillLoading, isOrderBillError, refetchOrderBill } = useOrderBill({
    orderId: orderId ?? undefined,
    enabled: isShowingBillLines,
  });

  // Each order opens on its items, not on the last order's Bill lines.
  useEffect(() => {
    setIsShowingBillLines(false);
  }, [orderId]);

  const isCancelled = orderDetail?.order.status === "cancelled";

  const isFulfillable =
    orderDetail?.order.type === "pre_order" &&
    orderDetail.order.status !== "fulfilled" &&
    orderDetail.order.status !== "cancelled";

  async function handleConfirmFulfil() {
    if (!orderId) return;
    try {
      await fulfillOrderAsync({ id: orderId });
      toast.success(tx("salesman.orders.fulfilSuccess"));
    } catch (fulfilOrderError) {
      const errorMessage =
        fulfilOrderError instanceof Error
          ? fulfilOrderError.message
          : tx("salesman.orders.fulfilFailed");
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
                  {tx(
                    orderDetail.order.type === "book_now"
                      ? "common.orderType.bookNow"
                      : "common.orderType.preOrder",
                  )}
                  <OrderStatusBadge status={orderDetail.order.status} />
                </>
              ) : (
                "Order details"
              )}
            </DrawerTitle>
          </DrawerHeader>

          <div className="flex max-h-[65vh] flex-col gap-4 overflow-y-auto px-4 pb-4">
            {isOrderDetailLoading ? (
              <CardDetailSkeleton />
            ) : !orderDetail ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-sm text-muted-foreground">Could not load order details</p>
                <Button type="button" variant="outline" onClick={() => refetchOrderDetail()}>
                  {tx("common.actions.tryAgain")}
                </Button>
              </div>
            ) : (
              <>
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

                {orderDetail.bill ? (
                  <div
                    className={cn(
                      "rounded-xl p-3",
                      isCancelled ? "bg-destructive/5" : "bg-brand/5",
                    )}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-xs text-muted-foreground">
                        {tx("salesman.orders.sheet.thisBill")}
                      </p>
                      <p className="font-mono text-xs">{orderDetail.bill.number}</p>
                    </div>
                    <p
                      className={cn(
                        "text-2xl font-semibold tabular-nums",
                        isCancelled ? "text-muted-foreground line-through" : "text-brand",
                      )}
                    >
                      {formatPaise(orderDetail.bill.totalPaise)}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {tx("salesman.orders.sheet.inclGst")}
                    </p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed p-3">
                    <p className="text-xs text-muted-foreground">
                      {tx(
                        isCancelled
                          ? "salesman.orders.sheet.noBillCancelled"
                          : orderDetail.order.type === "pre_order"
                            ? "salesman.orders.sheet.noBillPreorder"
                            : "salesman.orders.sheet.noBillYet",
                      )}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {tx("salesman.orders.qty", { count: orderDetail.totalQuantity })}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {tx("salesman.orders.sheet.route")}
                    </p>
                    <p className="truncate font-medium">{orderDetail.routeName}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {orderDetail.routeCode}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">
                      {tx("salesman.orders.sheet.placedBy")}
                    </p>
                    <p className="truncate font-medium">
                      {orderDetail.salesmanName ??
                        orderDetail.salesmanCode ??
                        tx("salesman.orders.sheet.office")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Placed at</p>
                    <p className="font-medium">
                      {formatDate(new Date(orderDetail.order.placedAt), "d MMM yyyy, h:mm a")}
                    </p>
                  </div>
                  {orderDetail.order.scheduledDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Scheduled for</p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.scheduledDate), "d MMM yyyy")}
                      </p>
                    </div>
                  )}
                  {orderDetail.order.fulfilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">Fulfilled at</p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.fulfilledAt), "d MMM yyyy, h:mm a")}
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
                      <p className="text-xs text-muted-foreground">
                        {tx("salesman.orders.sheet.cancelledAt")}
                      </p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.cancelledAt), "d MMM yyyy, h:mm a")}
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
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {isShowingBillLines
                        ? tx("salesman.orders.sheet.billLines")
                        : tx("salesman.orders.sheet.items", { count: orderDetail.totalQuantity })}
                    </p>
                    {orderDetail.bill && (
                      <button
                        type="button"
                        onClick={() => setIsShowingBillLines((isShowing) => !isShowing)}
                        className="text-xs font-medium text-brand underline-offset-2 hover:underline"
                      >
                        {tx(
                          isShowingBillLines
                            ? "salesman.orders.sheet.showItems"
                            : "salesman.orders.sheet.showBillLines",
                        )}
                      </button>
                    )}
                  </div>

                  {!isShowingBillLines ? (
                    orderDetail.items.map((item) => (
                      <div
                        key={item.varietyId}
                        className="flex items-start gap-3 rounded-xl border p-3 text-sm"
                      >
                        <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                          {item.imageUrl ? (
                            <img
                              src={item.imageUrl}
                              alt={item.stamp.name}
                              className="size-full object-cover"
                            />
                          ) : (
                            <PackageIcon className="size-5 text-muted-foreground" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium leading-snug">{item.stamp.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx("salesman.orders.sheet.hsn", { hsn: item.stamp.hsn })} · GST{" "}
                            <GstRate gstRateBps={item.gstRateBps} exempt={item.exempt} />
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                            <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm font-semibold text-brand">
                              {item.quantity}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              × {item.stamp.unit}
                            </span>
                          </p>
                          <p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                            {tx("salesman.orders.sheet.routePrice", {
                              price: formatPaise(item.routePricePaise),
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  ) : isOrderBillLoading ? (
                    <CardDetailSkeleton />
                  ) : isOrderBillError || !orderBill ? (
                    <div className="flex flex-col items-center gap-3 py-6 text-center">
                      <p className="text-sm text-muted-foreground">
                        {tx("salesman.orders.sheet.billLoadFailed")}
                      </p>
                      <Button type="button" variant="outline" onClick={() => refetchOrderBill()}>
                        {tx("common.actions.tryAgain")}
                      </Button>
                    </div>
                  ) : (
                    <OrderBillLines bill={orderBill} />
                  )}
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
