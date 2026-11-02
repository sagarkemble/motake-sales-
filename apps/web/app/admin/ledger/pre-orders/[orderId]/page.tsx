"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import {
  DUE_CHIP,
  LedgerBackHeader,
  PaperLoadFailed,
} from "~/components/admin/ledger/ledger-shared";
import {
  CancelPreOrderButton,
  CancelPreOrderDialog,
} from "~/components/admin/orders/cancel-pre-order-dialog";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useBillPaper } from "~/hooks/use-ledger";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export default function AdminPreOrderPaperPage() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { orderId } = useParams<{ orderId: string }>();
  const { preOrderPaper, isPreOrderPaperLoading, refetchPreOrderPaper } = useBillPaper({ orderId });
  const [cancelOpen, setCancelOpen] = useState(false);
  const customerId = preOrderPaper?.customer.id;

  const back = (
    <LedgerBackHeader customerId={customerId} shopName={preOrderPaper?.customer.shopName} />
  );

  if (isPreOrderPaperLoading) return <DetailPageSkeleton />;

  if (!preOrderPaper) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
        {back}
        <PaperLoadFailed
          message={tx("admin.ledger.preorder.loadError")}
          onRetry={() => void refetchPreOrderPaper()}
        />
      </div>
    );
  }

  const { order, route } = preOrderPaper;
  const open = order.status !== "fulfilled" && order.status !== "cancelled";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-4 sm:px-6">
      {back}
      <div className="rounded-2xl border bg-card shadow-sm p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">
              {tx("admin.ledger.preorder.title", {
                date: formatDate(order.scheduledDate, "d MMM yyyy"),
              })}
            </h2>
            <p className="text-xs text-muted-foreground">
              {preOrderPaper.placedByName &&
                `${tx("admin.ledger.preorder.placedBy", { name: preOrderPaper.placedByName })} · `}
              {route.name} ({route.code}) · {route.delivery_state}
            </p>
          </div>
          {open ? (
            <Badge variant="outline" className={cn("shrink-0", DUE_CHIP[order.dueState])}>
              {tx(`admin.ledger.preorders.due.${order.dueState}`)}
            </Badge>
          ) : (
            <OrderStatusBadge status={order.status} />
          )}
        </div>
        <ul className="mt-3 divide-y text-sm">
          {preOrderPaper.lines.map((line) => (
            <li key={line.varietyId} className="flex justify-between gap-2 py-2">
              <span className="min-w-0">
                {line.quantity} × {line.name}
              </span>
              <span className="shrink-0 text-muted-foreground">
                {formatPaise(line.routePricePaise)}
                {line.unit && ` · ${tx("admin.ledger.paper.perUnit", { unit: line.unit })}`}
              </span>
            </li>
          ))}
        </ul>
        {preOrderPaper.indicativeTotalPaise !== null && open && (
          <p className="mt-2 text-sm">
            {tx("admin.ledger.preorder.indicative", {
              amount: formatPaise(preOrderPaper.indicativeTotalPaise),
            })}
          </p>
        )}
        {order.notes && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tx("admin.ledger.preorder.note", { note: order.notes })}
          </p>
        )}
        {preOrderPaper.bill && (
          <Button size="sm" variant="outline" className="mt-3 rounded-full" asChild>
            <Link href={`/admin/ledger/bills/${preOrderPaper.bill.id}`}>
              {tx("admin.ledger.preorder.openBill", { number: preOrderPaper.bill.number })}
            </Link>
          </Button>
        )}
        {preOrderPaper.actions.canCancel && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <CancelPreOrderButton onClick={() => setCancelOpen(true)} />
          </div>
        )}
      </div>
      <CancelPreOrderDialog
        orderId={cancelOpen ? orderId : null}
        onClose={() => setCancelOpen(false)}
      />
    </div>
  );
}
