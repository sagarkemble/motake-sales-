"use client";

import { AlertTriangleIcon, PackageIcon } from "lucide-react";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { GstRate } from "~/components/shared/gst-rate";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { RouteCustomerDrawer } from "~/components/salesman/customers/route-customer-drawer";
import { OrderBillLines } from "~/components/salesman/order-bill-lines";
import {
  FulfilPreOrderDrawer,
  type FulfilTarget,
} from "~/components/salesman/orders/fulfil-pre-order-drawer";
import { useOrderBill } from "~/hooks/salesman/use-order-bill";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { isFulfilDue, isPreorderPending } from "~/lib/is-preorder-pending";
import { cn } from "~/lib/utils";

interface OrderDetailSheetProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailSheet({ orderId, onOpenChange }: OrderDetailSheetProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const [fulfilTarget, setFulfilTarget] = useState<FulfilTarget | null>(null);
  const [openedCustomerId, setOpenedCustomerId] = useState<string | null>(null);
  const [isShowingBillLines, setIsShowingBillLines] = useState(false);

  const { orderDetail, isOrderDetailLoading, refetchOrderDetail } = useOrders({
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

  // Only a due Pre-order: an upcoming one stays read-only, as on Route Pre-orders.
  const isFulfillable =
    orderDetail?.order.type === "pre_order" &&
    isPreorderPending(orderDetail.order.status) &&
    isFulfilDue(orderDetail.order.scheduledDate);

  // Fulfil opens the same drawer as Route Pre-orders: locked lines, Payment, success.
  function openFulfil() {
    if (!orderDetail?.order.scheduledDate) return;
    setFulfilTarget({
      orderId: orderDetail.order.id,
      shopName: orderDetail.customer.shopName,
      scheduledDate: orderDetail.order.scheduledDate,
      placedAt: new Date(orderDetail.order.placedAt),
      description: tx("salesman.orders.qty", { count: orderDetail.totalQuantity }),
    });
    onOpenChange(false);
  }

  // The shop name opens the same Customer drawer as the Customers tab.
  function openCustomer() {
    if (!orderDetail) return;
    setOpenedCustomerId(orderDetail.order.customerId);
    onOpenChange(false);
  }

  return (
    <>
      <Drawer open={Boolean(orderId)} onOpenChange={onOpenChange}>
        <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[90dvh]">
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
                tx("salesman.orders.sheet.title")
              )}
            </DrawerTitle>
          </DrawerHeader>

          {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
          <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            <div className="flex flex-col gap-4 px-4 pb-4">
              {isOrderDetailLoading ? (
                <CardDetailSkeleton />
              ) : !orderDetail ? (
                <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
                  <AlertTriangleIcon />
                  <AlertTitle className="line-clamp-none">
                    {tx("salesman.orders.sheet.loadFailed")}
                  </AlertTitle>
                  <AlertDescription>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="mt-1 rounded-full"
                      onClick={() => refetchOrderDetail()}
                    >
                      {tx("common.actions.tryAgain")}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <>
                  <div className="flex items-start gap-3 rounded-2xl border bg-muted/30 p-3">
                    <ShopPhotoThumbnail
                      shopPhotoUrl={orderDetail.customer.shopPhotoUrl}
                      shopName={orderDetail.customer.shopName}
                      size="md"
                    />
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={openCustomer}
                        className="text-left text-sm font-medium underline decoration-muted-foreground/40 underline-offset-4"
                      >
                        {orderDetail.customer.shopName}
                      </button>
                      {orderDetail.customer.contactName && (
                        <p className="text-xs text-muted-foreground">
                          {orderDetail.customer.contactName}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{orderDetail.customer.phone}</p>
                      <p className="text-xs text-muted-foreground">
                        {orderDetail.customer.address}
                      </p>
                    </div>
                  </div>

                  {orderDetail.bill ? (
                    <div
                      className={cn(
                        "rounded-2xl p-3",
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
                    <div className="rounded-2xl border border-dashed p-3">
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
                      <p className="text-xs text-muted-foreground">
                        {tx("salesman.orders.sheet.placedAt")}
                      </p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.placedAt), "d MMM yyyy, h:mm a")}
                      </p>
                    </div>
                    {orderDetail.order.scheduledDate && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {tx("salesman.orders.sheet.scheduledFor")}
                        </p>
                        <p className="font-medium">
                          {formatDate(new Date(orderDetail.order.scheduledDate), "EEE, d MMM yyyy")}
                        </p>
                      </div>
                    )}
                    {orderDetail.order.fulfilledAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {tx("salesman.orders.sheet.fulfilledAt")}
                        </p>
                        <p className="font-medium">
                          {formatDate(
                            new Date(orderDetail.order.fulfilledAt),
                            "d MMM yyyy, h:mm a",
                          )}
                        </p>
                      </div>
                    )}
                    {orderDetail.order.fulfilledAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {tx("salesman.orders.sheet.fulfilledBy")}
                        </p>
                        <p className="font-medium">{orderDetail.fulfilledBySalesmanName ?? "—"}</p>
                      </div>
                    )}
                    {orderDetail.order.cancelledAt && (
                      <div>
                        <p className="text-xs text-muted-foreground">
                          {tx("salesman.orders.sheet.cancelledAt")}
                        </p>
                        <p className="font-medium">
                          {formatDate(
                            new Date(orderDetail.order.cancelledAt),
                            "d MMM yyyy, h:mm a",
                          )}
                        </p>
                      </div>
                    )}
                  </div>

                  {orderDetail.order.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {tx("salesman.orders.sheet.notes")}
                      </p>
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
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => setIsShowingBillLines((isShowing) => !isShowing)}
                          className="h-auto p-0 text-xs font-medium text-brand"
                        >
                          {tx(
                            isShowingBillLines
                              ? "salesman.orders.sheet.showItems"
                              : "salesman.orders.sheet.showBillLines",
                          )}
                        </Button>
                      )}
                    </div>

                    {!isShowingBillLines ? (
                      orderDetail.items.map((item) => (
                        <div
                          key={item.varietyId}
                          className="flex items-start gap-3 rounded-2xl border p-3 text-sm"
                        >
                          <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted/40">
                            {item.imageUrl ? (
                              <img
                                src={item.imageUrl}
                                alt={item.stamp.name}
                                className="size-full object-contain p-1"
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
                      <Alert
                        variant="destructive"
                        className="border-destructive/30 bg-destructive/5"
                      >
                        <AlertTriangleIcon />
                        <AlertTitle className="line-clamp-none">
                          {tx("salesman.orders.sheet.billLoadFailed")}
                        </AlertTitle>
                        <AlertDescription>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="mt-1 rounded-full"
                            onClick={() => refetchOrderBill()}
                          >
                            {tx("common.actions.tryAgain")}
                          </Button>
                        </AlertDescription>
                      </Alert>
                    ) : (
                      <OrderBillLines bill={orderBill} />
                    )}
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {isFulfillable && (
            <DrawerFooter>
              <Button
                type="button"
                onClick={openFulfil}
                className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                {tx("salesman.orders.route.fulfil")}
              </Button>
            </DrawerFooter>
          )}
        </DrawerContent>
      </Drawer>

      {fulfilTarget && (
        <FulfilPreOrderDrawer
          key={fulfilTarget.orderId}
          target={fulfilTarget}
          onClose={() => setFulfilTarget(null)}
        />
      )}

      {openedCustomerId && (
        <RouteCustomerDrawer
          key={openedCustomerId}
          customerId={openedCustomerId}
          onClose={() => setOpenedCustomerId(null)}
        />
      )}
    </>
  );
}
