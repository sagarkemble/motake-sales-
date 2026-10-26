"use client";

import { FileTextIcon, PackageIcon } from "lucide-react";
import { useState } from "react";

import { BillDetailDialog } from "~/components/admin/bills/bill-detail-dialog";
import { GstRate } from "~/components/shared/gst-rate";
import { SalesmanLabel } from "~/components/admin/orders/salesman-label";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { cn } from "~/lib/utils";

interface OrderDetailDialogProps {
  orderId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function OrderDetailDialog({ orderId, onOpenChange }: OrderDetailDialogProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { orderDetail, isOrderDetailLoading } = useOrders({ detailOrderId: orderId ?? undefined });
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);

  return (
    <Dialog open={Boolean(orderId)} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-0 rounded-2xl p-0">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle>
                {orderDetail ? orderDetail.customer.shopName : tx("admin.orders.detailTitle")}
              </DialogTitle>
              {orderDetail && (
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="font-normal">
                      {tx(
                        orderDetail.order.type === "pre_order"
                          ? "common.orderType.preOrder"
                          : "common.orderType.bookNow",
                      )}
                    </Badge>
                    <OrderStatusBadge status={orderDetail.order.status} />
                  </div>
                </DialogDescription>
              )}
            </DialogHeader>

            {isOrderDetailLoading || !orderDetail ? (
              <CardDetailSkeleton />
            ) : (
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

                {orderDetail.bill ? (
                  <div className="flex items-center justify-between gap-3 rounded-xl bg-brand/5 p-3">
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">
                        {orderDetail.order.status === "cancelled"
                          ? tx("admin.orders.billCancelled")
                          : tx("admin.orders.bill")}
                      </p>
                      <p className="font-mono text-sm font-medium">{orderDetail.bill.number}</p>
                      <p
                        className={cn(
                          "text-lg font-semibold",
                          orderDetail.order.status === "cancelled"
                            ? "text-muted-foreground line-through"
                            : "text-brand",
                        )}
                      >
                        {formatPaise(orderDetail.bill.totalPaise)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="shrink-0 rounded-full"
                      onClick={() => setSelectedBillId(orderDetail.bill?.id ?? null)}
                    >
                      <FileTextIcon className="size-4" />
                      {tx("admin.orders.openBill")}
                    </Button>
                  </div>
                ) : (
                  <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
                    {orderDetail.order.status === "cancelled"
                      ? tx("admin.orders.noBillCancelled")
                      : orderDetail.order.type === "pre_order"
                        ? tx("admin.orders.noBillPreOrder")
                        : tx("admin.orders.noBillYet")}
                  </p>
                )}

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">{tx("admin.orders.route")}</p>
                    <p className="font-medium">{orderDetail.routeName}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {orderDetail.routeCode}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{tx("admin.orders.salesman")}</p>
                    <p className="font-medium">
                      <SalesmanLabel
                        salesmanCode={orderDetail.salesmanCode}
                        salesmanName={orderDetail.salesmanName}
                      />
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {tx("admin.orders.totalQuantity")}
                    </p>
                    <p className="font-medium">{orderDetail.totalQuantity}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{tx("admin.orders.placedAt")}</p>
                    <p className="font-medium">
                      {formatDate(new Date(orderDetail.order.placedAt), "d MMM yyyy, h:mm a")}
                    </p>
                  </div>
                  {orderDetail.order.scheduledDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {tx("admin.orders.scheduledFor")}
                      </p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.scheduledDate), "d MMM yyyy")}
                      </p>
                    </div>
                  )}
                  {orderDetail.order.fulfilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {tx("admin.orders.fulfilledAt")}
                      </p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.fulfilledAt), "d MMM yyyy, h:mm a")}
                      </p>
                    </div>
                  )}
                  {orderDetail.order.fulfilledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {tx("admin.orders.fulfilledBy")}
                      </p>
                      <p className="font-medium">
                        {orderDetail.fulfilledBySalesmanName ?? (
                          <span className="italic">{tx("admin.orders.office")}</span>
                        )}
                      </p>
                    </div>
                  )}
                  {orderDetail.order.cancelledAt && (
                    <div>
                      <p className="text-xs text-muted-foreground">
                        {tx("admin.orders.cancelledAt")}
                      </p>
                      <p className="font-medium">
                        {formatDate(new Date(orderDetail.order.cancelledAt), "d MMM yyyy, h:mm a")}
                      </p>
                    </div>
                  )}
                </div>

                {orderDetail.order.notes && (
                  <div>
                    <p className="text-xs text-muted-foreground">{tx("admin.orders.notes")}</p>
                    <p className="text-sm">{orderDetail.order.notes}</p>
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-xs text-muted-foreground">{tx("admin.orders.items")}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {tx("admin.orders.routePriceHint")}
                    </p>
                  </div>
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
                        <p className="truncate text-xs text-muted-foreground">{item.stamp.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          HSN {item.stamp.hsn} · GST{" "}
                          <GstRate gstRateBps={item.gstRateBps} exempt={item.exempt} />
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="flex items-baseline justify-end gap-1.5 whitespace-nowrap">
                          <span className="rounded-md bg-brand/10 px-1.5 py-0.5 text-sm font-semibold text-brand">
                            {item.quantity}
                          </span>
                          <span className="text-xs text-muted-foreground">× {item.stamp.unit}</span>
                        </p>
                        <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                          {formatPaise(item.routePricePaise)} / {item.stamp.unit}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <BillDetailDialog
              billId={selectedBillId}
              onOpenChange={(open) => !open && setSelectedBillId(null)}
            />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
