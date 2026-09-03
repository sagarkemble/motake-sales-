"use client";

import { format } from "date-fns";
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
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { useCustomers } from "~/hooks/use-customers";
import { useOrders } from "~/hooks/use-orders";
import { formatInrCompact } from "~/lib/format-money";
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

  async function handleCloseOrder(orderId: string) {
    setResolvingOrderId(orderId);
    try {
      await fulfillOrderAsync({ id: orderId });
      toast.success("Order closed");
      await refetchOpenOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not close order. Try again."));
    } finally {
      setResolvingOrderId(null);
    }
  }

  async function handleCancelOrder(orderId: string) {
    setResolvingOrderId(orderId);
    try {
      await cancelOrderAsync({ id: orderId });
      toast.success("Order cancelled");
      await refetchOpenOrders();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not cancel order. Try again."));
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
        toast.error(getErrorMessage(error, `Could not close ${order.orderCode}.`));
        setResolvingOrderId(null);
        await refetchOpenOrders();
        return;
      }
    }
    setResolvingOrderId(null);
    toast.success("All open orders closed");
    await refetchOpenOrders();
  }

  async function handleCancelAll() {
    for (const order of openOrders) {
      setResolvingOrderId(order.id);
      try {
        await cancelOrderAsync({ id: order.id });
      } catch (error) {
        toast.error(getErrorMessage(error, `Could not cancel ${order.orderCode}.`));
        setResolvingOrderId(null);
        await refetchOpenOrders();
        return;
      }
    }
    setResolvingOrderId(null);
    toast.success("All open orders cancelled");
    await refetchOpenOrders();
  }

  async function handleDeactivate() {
    try {
      await deactivateCustomerAsync({ id: customerId });
      toast.success("Customer deactivated");
      onOpenChange(false);
      onDeactivated?.();
    } catch (error) {
      toast.error(getErrorMessage(error, "Could not deactivate customer. Try again."));
      await refetchOpenOrders();
    }
  }

  const isBusy = Boolean(resolvingOrderId) || isDeactivatingCustomer;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-h-[85vh] overflow-y-auto rounded-2xl sm:max-w-md">
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
                    <p className="font-medium">{order.orderCode}</p>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {order.type === "pre_order" ? "Pre-order" : "Book now"}
                    {order.scheduledDate
                      ? ` · ${format(new Date(order.scheduledDate), "d MMM yyyy")}`
                      : ` · ${format(new Date(order.placedAt), "d MMM yyyy")}`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {order.totalQuantity} qty · {formatInrCompact(order.totalAmount)}
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
                They will leave the active list. Order history stays. Salesmen cannot select them
                for new orders.
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
      </AlertDialogContent>
    </AlertDialog>
  );
}
