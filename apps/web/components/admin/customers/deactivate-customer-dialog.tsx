"use client";

import { useEffect } from "react";
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
import { ScrollArea } from "~/components/ui/scroll-area";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { useCustomers } from "~/hooks/use-customers";
import { useFormatDate } from "~/hooks/use-format-date";
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

  useEffect(() => {
    if (open) void refetchOpenOrders();
  }, [open, refetchOpenOrders]);

  const openOrderCount = openOrders.length;
  const hasOpenOrders = openOrderCount > 0;
  const canDeactivate = !isOpenOrdersLoading && !hasOpenOrders;

  type OpenOrder = (typeof openOrders)[number];

  function getOrderDateLabel(order: OpenOrder) {
    return formatDate(new Date(order.scheduledDate ?? order.placedAt), "d MMM yyyy");
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

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="flex max-h-[85vh] flex-col gap-0 rounded-2xl p-0 sm:max-w-md">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-6">
            {isOpenOrdersLoading ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Checking open Pre-orders…</AlertDialogTitle>
                  <AlertDialogDescription>
                    A customer with open Pre-orders cannot be deactivated.
                  </AlertDialogDescription>
                </AlertDialogHeader>
              </>
            ) : hasOpenOrders ? (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cannot deactivate</AlertDialogTitle>
                  <AlertDialogDescription>
                    This customer has {openOrderCount} open Pre-order
                    {openOrderCount === 1 ? "" : "s"}. A customer with open Pre-orders cannot be
                    deactivated.
                  </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="flex flex-col gap-2 py-2">
                  {openOrders.map((order) => (
                    <div key={order.id} className="rounded-xl border p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium">{tx("common.orderType.preOrder")}</p>
                        <OrderStatusBadge status={order.status} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {getOrderDateLabel(order)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {order.totalQuantity} {tx("common.units.qty")}
                      </p>
                    </div>
                  ))}
                </div>

                <AlertDialogFooter>
                  <AlertDialogCancel>Keep active</AlertDialogCancel>
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
                  <AlertDialogCancel disabled={isDeactivatingCustomer}>
                    Keep active
                  </AlertDialogCancel>
                  <AlertDialogAction
                    disabled={!canDeactivate || isDeactivatingCustomer}
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
