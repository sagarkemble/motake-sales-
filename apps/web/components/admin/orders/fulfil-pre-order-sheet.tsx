"use client";

import { businessDateOf, type RouterOutputs } from "@repo/trpc/client";
import { BuildingIcon } from "lucide-react";

import { CheckoutSuccess } from "~/components/shared/checkout/checkout-success";
import { FulfilPayment, LockedLines } from "~/components/shared/checkout/fulfil-pre-order-panel";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useFulfilPreOrder } from "~/hooks/shared/use-fulfil-pre-order";
import { useFormatDate } from "~/hooks/use-format-date";
import { useTranslate } from "~/hooks/use-translate";
import { isPreorderPending } from "~/lib/is-preorder-pending";

type OrderListRow = RouterOutputs["orders"]["list"]["data"]["items"][number];

// An open Pre-order: not fulfilled and not cancelled.
export function isOpenPreorder(row: OrderListRow) {
  return row.type === "pre_order" && Boolean(row.scheduledDate) && isPreorderPending(row.status);
}

// Admin may fulfil on or after the scheduled date (Asia/Kolkata).
export function isFulfilDue(scheduledDate: string | null) {
  return Boolean(scheduledDate) && (scheduledDate ?? "") <= businessDateOf(new Date());
}

/** The row's Fulfil button; before the scheduled date it is disabled with the date. */
export function FulfilRowButton({ row, onFulfil }: { row: OrderListRow; onFulfil: () => void }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  if (!isFulfilDue(row.scheduledDate)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} onClick={(event) => event.stopPropagation()}>
            <Button type="button" size="sm" variant="outline" disabled className="rounded-full">
              {tx("admin.orders.fulfil.button")}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {tx("admin.orders.fulfil.fromDate", {
            date: formatDate(row.scheduledDate ?? "", "d MMM yyyy"),
          })}
        </TooltipContent>
      </Tooltip>
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      onClick={(event) => {
        event.stopPropagation();
        onFulfil();
      }}
    >
      {tx("admin.orders.fulfil.button")}
    </Button>
  );
}

interface FulfilPreOrderSheetProps {
  row: OrderListRow;
  onClose: () => void;
}

/**
 * Admin fulfils a Pre-order from the Orders list: no GatePass, no stock change, the Bill from the
 * terms locked at place, and the same Payment block and success summary as the salesman.
 */
export function FulfilPreOrderSheet({ row, onClose }: FulfilPreOrderSheetProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const scheduledDate = row.scheduledDate ?? "";
  const fulfil = useFulfilPreOrder({ orderId: row.id, shopName: row.customerShopName });
  const isDue = isFulfilDue(row.scheduledDate);
  const hint = !isDue
    ? tx("admin.orders.fulfil.opensOn", { date: formatDate(scheduledDate, "EEE, d MMM yyyy") })
    : fulfil.problemKey
      ? tx(fulfil.problemKey)
      : null;

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
        <SheetHeader className="border-b">
          <SheetTitle>{row.customerShopName}</SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2">
            {tx("admin.orders.fulfil.subtitle", {
              date: formatDate(scheduledDate, "EEE, d MMM yyyy"),
              route: row.routeName,
            })}
            <Badge
              variant="outline"
              className={
                isDue
                  ? "border-transparent bg-amber-500/10 text-amber-700"
                  : "border-transparent bg-muted text-muted-foreground"
              }
            >
              {tx(isDue ? "admin.orders.fulfil.due" : "admin.orders.fulfil.scheduled")}
            </Badge>
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {fulfil.result ? (
            <CheckoutSuccess
              input={fulfil.result}
              actions={[{ label: tx("checkout.success.close"), primary: true, onClick: onClose }]}
            />
          ) : (
            <div className="flex flex-col gap-5">
              <LockedLines
                state={fulfil}
                shopName={row.customerShopName}
                scheduledDate={scheduledDate}
                placedAt={new Date(row.placedAt)}
              />
              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">{tx("admin.orders.fulfil.paymentTitle")}</p>
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <BuildingIcon className="mt-0.5 size-3.5 shrink-0" />
                  {tx("admin.orders.fulfil.officeNote")}
                </p>
              </div>
              {isDue ? (
                <FulfilPayment state={fulfil} shopName={row.customerShopName} />
              ) : (
                <p className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{hint}</p>
              )}
            </div>
          )}
        </div>

        {!fulfil.result && (
          <SheetFooter className="border-t">
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
            <Button
              type="button"
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              disabled={!isDue || !fulfil.paymentContext || Boolean(hint) || fulfil.isFulfilling}
              onClick={() => void fulfil.fulfil()}
            >
              {fulfil.isFulfilling ? tx("common.status.pleaseWait") : tx("checkout.fulfil.cta")}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
