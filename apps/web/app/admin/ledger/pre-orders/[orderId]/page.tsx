"use client";

import { AlertCircleIcon, ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  ReasonField,
  RefusalAlert,
  ledgerReturnHref,
} from "~/components/admin/ledger/ledger-shared";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { useBillPaper } from "~/hooks/use-ledger";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage } from "~/lib/refusal";

const DUE_BADGE = { overdue: "destructive", due: "default", upcoming: "secondary" } as const;

export default function AdminPreOrderPaperPage() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { orderId } = useParams<{ orderId: string }>();
  const { preOrderPaper, isPreOrderPaperLoading, refetchPreOrderPaper } = useBillPaper({ orderId });
  const { cancelOrderAsync, isCancellingOrder } = useOrders();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refusal, setRefusal] = useState<string | null>(null);
  const customerId = preOrderPaper?.customer.id;
  const [backHref, setBackHref] = useState("/admin/ledger");
  useEffect(() => setBackHref(ledgerReturnHref(customerId)), [customerId]);

  async function handleCancel() {
    if (reason.trim() === "" || isCancellingOrder) return;
    setRefusal(null);
    try {
      await cancelOrderAsync({ id: orderId, reason: reason.trim() });
      toast.success(tx("admin.ledger.preorder.done"));
      setCancelOpen(false);
      setReason("");
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  const back = (
    <Link
      href={backHref}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon className="size-4" />
      {preOrderPaper
        ? tx("admin.ledger.paper.back", { shopName: preOrderPaper.customer.shopName })
        : tx("admin.ledger.title")}
    </Link>
  );

  if (isPreOrderPaperLoading) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!preOrderPaper) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-3 px-4 py-4">
        {back}
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{tx("admin.ledger.preorder.loadError")}</AlertTitle>
          <AlertDescription>
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => refetchPreOrderPaper()}
            >
              {tx("common.actions.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { order, route } = preOrderPaper;
  const open = order.status !== "fulfilled" && order.status !== "cancelled";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
      {back}
      <div className="rounded-md border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-semibold">
              {tx("admin.ledger.preorder.title", {
                date: formatDate(order.scheduledDate, "d MMM yyyy"),
              })}
            </p>
            <p className="text-xs text-muted-foreground">
              {preOrderPaper.placedByName &&
                `${tx("admin.ledger.preorder.placedBy", { name: preOrderPaper.placedByName })} · `}
              {route.name} ({route.code}) · {route.delivery_state}
            </p>
          </div>
          {open ? (
            <Badge variant={DUE_BADGE[order.dueState]}>
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
                {formatPaise(line.routePricePaise)} ·{" "}
                {tx("admin.ledger.paper.perUnit", { unit: line.unit })}
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
          <Button size="sm" variant="outline" className="mt-3" asChild>
            <Link href={`/admin/ledger/bills/${preOrderPaper.bill.id}`}>
              {tx("admin.ledger.preorder.openBill", { number: preOrderPaper.bill.number })}
            </Link>
          </Button>
        )}
        {preOrderPaper.actions.canCancel && (
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" onClick={() => setCancelOpen(true)}>
              {tx("admin.ledger.preorder.cancel")}
            </Button>
          </div>
        )}
      </div>
      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tx("admin.ledger.preorder.cancel")}</DialogTitle>
            <DialogDescription>{tx("admin.ledger.preorder.cancelBody")}</DialogDescription>
          </DialogHeader>
          <ReasonField
            id="preorder-reason"
            value={reason}
            onChange={setReason}
            disabled={isCancellingOrder}
            placeholder={tx("admin.ledger.preorder.placeholder")}
          />
          {refusal && <RefusalAlert message={refusal} />}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={isCancellingOrder}
              onClick={() => setCancelOpen(false)}
            >
              {tx("admin.ledger.close")}
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim() === "" || isCancellingOrder}
              onClick={handleCancel}
            >
              {isCancellingOrder && <Spinner />}
              {tx("admin.ledger.preorder.cancel")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
