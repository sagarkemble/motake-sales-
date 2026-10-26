"use client";

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
import { ScrollArea } from "~/components/ui/scroll-area";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { useCustomers } from "~/hooks/use-customers";
import { useFormatDate } from "~/hooks/use-format-date";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";

interface DeactivateCustomerDialogProps {
  customerId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeactivated?: () => void;
}

export function DeactivateCustomerDialog({
  customerId,
  open,
  onOpenChange,
  onDeactivated,
}: DeactivateCustomerDialogProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const [resolvingOrderId, setResolvingOrderId] = useState<string | null>(null);
  const [initialOpenCount, setInitialOpenCount] = useState(0);

  const {
    openOrders,
    isOpenOrdersLoading,
    refetchOpenOrders,
    deactivateCustomerAsync,
    isDeactivatingCustomer,
  } = useCustomers({
    customerId,
    loadOpenOrders: open,
  });

  const { fulfillOrderAsync, cancelOrderAsync } = useOrders();

  useEffect(() => {
    if (open) {
      void refetchOpenOrders();
    } else {
      setInitialOpenCount(0);
    }
  }, [open, refetchOpenOrders]);

  useEffect(() => {
    if (open && !isOpenOrdersLoading && initialOpenCount === 0 && openOrders.length > 0) {
      setInitialOpenCount(openOrders.length);
    }
  }, [open, isOpenOrdersLoading, openOrders.length, initialOpenCount]);

  const openOrderCount = openOrders.length;
  const hasOpenOrders = openOrderCount > 0;
  const canDeactivate = !isOpenOrdersLoading && !hasOpenOrders;
  const resolvedCount = Math.max(0, initialOpenCount - openOrderCount);
  const progressTotal = Math.max(initialOpenCount, openOrderCount);

  type OpenOrder = (typeof openOrders)[number];

  // Orders carry no code, so an order is identified by its type and date.
  function getOrderTypeLabel(order: OpenOrder) {
    return order.type === "pre_order"
      ? tx("common.orderType.preOrder")
      : tx("common.orderType.bookNow");
  }

  function getOrderDateLabel(order: OpenOrder) {
    return formatDate(new Date(order.scheduledDate ?? order.placedAt), "d MMM yyyy");
  }

  function describeOrder(order: OpenOrder) {
    return `${getOrderTypeLabel(order)} · ${getOrderDateLabel(order)}`;
  }

  async function handleCloseOrder(orderId: string) {
    setResolvingOrderId(orderId);
    try {
      await fulfillOrderAsync({ id: orderId });
      toast.success(tx("admin.customers.orderClosed"));
      await refetchOpenOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.orderCloseFailed")));
    } finally {
      setResolvingOrderId(null);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setResolvingOrderId(orderId);
    try {
      await cancelOrderAsync({ id: orderId });
      toast.success(tx("admin.customers.orderCancelled"));
      await refetchOpenOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.orderCancelFailed")));
    } finally {
      setResolvingOrderId(null);
    }
  }

  async function handleCloseAll() {
    for (const order of openOrders) {
      setResolvingOrderId(order.id);
      try {
        await fulfillOrderAsync({ id: order.id });
      } catch (error) {
        toast.error(getErrorMessage(error, `Could not close ${describeOrder(order)}.`));
        setResolvingOrderId(null);
        await refetchOpenOrders();
        return;
      }
    }
    setResolvingOrderId(null);
    toast.success(tx("admin.customers.allOrdersClosed"));
    await refetchOpenOrders();
  }

  async function handleCancelAll() {
    for (const order of openOrders) {
      setResolvingOrderId(order.id);
      try {
        await cancelOrderAsync({ id: order.id });
      } catch (error) {
        toast.error(getErrorMessage(error, `Could not cancel ${describeOrder(order)}.`));
        setResolvingOrderId(null);
        await refetchOpenOrders();
        return;
      }
    }
    setResolvingOrderId(null);
    toast.success(tx("admin.customers.allOrdersCancelled"));
    await refetchOpenOrders();
  }

  async function handleDeactivate() {
    try {
      await deactivateCustomerAsync({ id: customerId });
      toast.success(tx("admin.customers.deactivateSuccess"));
      onOpenChange(false);
      onDeactivated?.();
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.deactivateFailed")));
      await refetchOpenOrders();
    }
  }

  const isBusy = Boolean(resolvingOrderId) || isDeactivatingCustomer;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[85vh] flex-col gap-0 rounded-2xl p-0 sm:max-w-md">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-6">
            {isOpenOrdersLoading ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Checking open orders…</AlertDialogTitle>
                  <AlertDialogDescription>
                    Looking for orders that must be closed or cancelled first.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </>
            ) : hasOpenOrders ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cannot deactivate yet</AlertDialogTitle>
                  <AlertDialogDescription>
                    {openOrderCount} open order{openOrderCount === 1 ? "" : "s"} must be closed or
                    cancelled first.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-2 py-2">
                  {openOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{getOrderTypeLabel(order)}</p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getOrderDateLabel(order)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.totalQuantity} {tx("common.units.qty")}
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full"
                          disabled={isBusy}
                          onClick={() => handleCloseOrder(order.id)}
                        >
                          {resolvingOrderId === order.id ? "…" : "Close"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
                          disabled={isBusy}
                          onClick={() => handleCancelOrder(order.id)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    disabled={isBusy}
                    onClick={handleCloseAll}
                  >
                    Close all
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
                    disabled={isBusy}
                    onClick={handleCancelAll}
                  >
                    Cancel all
                  </Button>
                </div>

                <p className="text-xs text-muted-foreground">
                  Progress {resolvedCount} of {progressTotal} resolved
                </p>

                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isBusy}>Keep active</AlertDialogCancel>
                  <AlertDialogAction disabled className="opacity-50">
                    Deactivate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            ) : (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Deactivate this customer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    They will leave the active list. Order history stays. Salesmen cannot select
                    them for new orders.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isBusy}>Keep active</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!canDeactivate || isBusy}
                    onClick={(event) => {
                      event.preventDefault();
                      void handleDeactivate();
                    }}
                  >
                    {isDeactivatingCustomer ? "Deactivating…" : "Deactivate"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            )}
          </div>
        </ScrollArea>
      </AlertDialogContent>
    </AlertDialog>
  );
}
