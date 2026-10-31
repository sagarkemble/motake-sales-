"use client";

import { LockIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useBillGst, type BillGstState } from "~/hooks/use-gst";
import type { BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

import { offReason } from "./bill-paper-parts";

// --- Read-only pieces.

function FiledMonthBadge() {
  const tx = useTranslate();
  return (
    <Badge variant="outline" className="gap-1">
      <LockIcon className="size-3" />
      {tx("admin.ledger.paper.gst.filedMonth")}
    </Badge>
  );
}

function FiledMonthNote({ gst }: { gst: BillGstState }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { filings } = useBillGst({ loadFilings: gst.filedMonth, enabled: gst.filedMonth });
  const month = formatDate(`${gst.month}-01`, "MMM yyyy");
  if (!gst.filedMonth) {
    return (
      <p className="text-sm text-muted-foreground">
        {tx("admin.ledger.paper.gst.openMonth", { month })}
      </p>
    );
  }
  const filing = filings.find((row) => row.periodMonth.startsWith(gst.month));
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted px-2 py-1.5 text-xs">
      <LockIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium">{tx("admin.ledger.paper.gst.filedMonth")}:</span>{" "}
        {filing
          ? tx("admin.ledger.paper.gst.filedMonthNote", {
              month,
              date: formatDate(filing.filedOn, "d MMM yyyy"),
              reference: filing.reference,
            })
          : tx("admin.ledger.paper.gst.filedMonthPlain", { month })}
      </span>
    </p>
  );
}

function OffReasons({ reasons, className }: { reasons: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      {reasons.map((reason) => (
        <li key={reason} className="flex gap-1.5">
          <LockIcon className="mt-0.5 size-3 shrink-0" />
          {reason}
        </li>
      ))}
    </ul>
  );
}

/** Why Spec G's Correct and Cancel are off, visibly (a title tooltip does not show on a phone). */
export function BillGateReasons({ paper, className }: { paper: BillPaper; className?: string }) {
  const tx = useTranslate();
  const reasons = [
    ...new Set(
      [
        !paper.actions.canCorrect ? offReason(paper, "correct", tx) : undefined,
        !paper.actions.canCancel ? offReason(paper, "cancel", tx) : undefined,
      ].filter((reason): reason is string => Boolean(reason)),
    ),
  ];
  if (reasons.length === 0) return null;
  return <OffReasons reasons={reasons} className={className} />;
}

/** The GST card in the Bill paper's side panel: whether the Bill's GSTR-1 month is filed. */
export function GstCard({
  gst,
  isLoading,
  isError,
  onRetry,
}: {
  gst: BillGstState | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const tx = useTranslate();
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tx("admin.ledger.paper.gst.title")}</h2>
          {gst?.filedMonth && <FiledMonthBadge />}
        </div>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError || !gst ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {tx("admin.ledger.paper.gst.loadError")}
            </p>
            <Button size="sm" variant="outline" className="rounded-full" onClick={onRetry}>
              {tx("common.actions.tryAgain")}
            </Button>
          </div>
        ) : (
          <FiledMonthNote gst={gst} />
        )}
      </div>
    </section>
  );
}
