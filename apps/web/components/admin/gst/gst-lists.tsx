"use client";

import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { Gstr1Filing, IrnPendingRow } from "~/hooks/use-gst";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export function billPaperHref(billId: string): string {
  return `/admin/ledger/bills/${billId}?from=gst`;
}

/** `2026-10` or `2026-10-01` → `Oct 2026` in the active locale. */
export function useMonthLabel() {
  const formatDate = useFormatDate();
  return (month: string) => formatDate(`${month.slice(0, 7)}-01`, "MMM yyyy");
}

export function GstSkeleton({ rows = 5 }: { rows?: number }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col gap-2" aria-busy="true" aria-label={tx("common.status.loading")}>
      <ListItemSkeleton count={rows} />
    </div>
  );
}

export function GstError({ onRetry }: { onRetry: () => void }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border bg-card px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{tx("admin.gst.loadError.title")}</p>
      <Button type="button" variant="outline" className="rounded-full" onClick={onRetry}>
        {tx("common.actions.tryAgain")}
      </Button>
    </div>
  );
}

function GstEmpty({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
    </div>
  );
}

/** Filed months, newest first: one card per month on phones, a table from `md` up. */
export function FilingsList({
  filings,
  onCorrect,
}: {
  filings: Gstr1Filing[];
  onCorrect: (filing: Gstr1Filing) => void;
}) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const monthLabel = useMonthLabel();

  if (filings.length === 0)
    return (
      <GstEmpty
        title={tx("admin.gst.filings.emptyTitle")}
        body={tx("admin.gst.filings.emptyBody")}
      />
    );

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {filings.map((filing) => (
          <li key={filing.id}>
            <button
              type="button"
              className="flex w-full items-start justify-between gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
              onClick={() => onCorrect(filing)}
            >
              <span className="min-w-0">
                <span className="block font-medium">{monthLabel(filing.periodMonth)}</span>
                <span className="block text-xs text-muted-foreground">
                  {tx("admin.gst.filings.filedBy", {
                    date: formatDate(filing.filedOn, "d MMM yyyy"),
                    filer: filing.filerName ?? "—",
                  })}
                </span>
                <span className="block truncate font-mono text-xs">{filing.reference}</span>
                {filing.notes && (
                  <span className="block text-xs text-muted-foreground">{filing.notes}</span>
                )}
              </span>
              <ChevronRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("admin.gst.filings.columns.month")}</TableHead>
              <TableHead>{tx("admin.gst.filings.columns.filedOn")}</TableHead>
              <TableHead>{tx("admin.gst.filings.columns.reference")}</TableHead>
              <TableHead>{tx("admin.gst.filings.columns.filer")}</TableHead>
              <TableHead>{tx("admin.gst.filings.columns.notes")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filings.map((filing) => (
              <TableRow key={filing.id}>
                <TableCell className="font-medium">{monthLabel(filing.periodMonth)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(filing.filedOn, "d MMM yyyy")}
                </TableCell>
                <TableCell className="font-mono text-xs">{filing.reference}</TableCell>
                <TableCell>{filing.filerName ?? "—"}</TableCell>
                <TableCell className="max-w-56 whitespace-normal text-xs text-muted-foreground">
                  {filing.notes ?? "—"}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="rounded-full"
                    onClick={() => onCorrect(filing)}
                  >
                    {tx("admin.gst.filings.correct")}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}

export function IrnPendingBadge({ count }: { count: number | null }) {
  if (count === null) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2 text-xs tabular-nums",
        count > 0 ? "bg-brand/10 text-brand" : "bg-muted text-muted-foreground",
      )}
    >
      {count}
    </span>
  );
}

function FiledMonthBadge({ className }: { className?: string }) {
  const tx = useTranslate();
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent bg-muted text-muted-foreground", className)}
    >
      {tx("admin.gst.filedMonth")}
    </Badge>
  );
}

/** IRN pending Bills, oldest first; each row opens the Bill paper. */
export function IrnPendingList({ rows }: { rows: IrnPendingRow[] }) {
  const tx = useTranslate();
  const router = useRouter();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  if (rows.length === 0)
    return <GstEmpty title={tx("admin.gst.irn.emptyTitle")} body={tx("admin.gst.irn.emptyBody")} />;

  return (
    <>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <li key={row.billId}>
            <Link
              href={billPaperHref(row.billId)}
              className="flex items-start justify-between gap-3 rounded-2xl border bg-card p-3 transition-colors hover:bg-accent/50"
            >
              <span className="min-w-0">
                <span className="block font-mono text-sm font-medium">{row.number}</span>
                <span className="block truncate text-sm">{row.customerShopName ?? "—"}</span>
                <span className="block text-xs text-muted-foreground">
                  {row.routeName} ({row.routeCode}) · {formatDate(row.billDate, "d MMM yyyy")}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-sm tabular-nums">{formatPaise(row.totalPaise)}</span>
                {row.filedMonth && <FiledMonthBadge />}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("admin.gst.irn.columns.bill")}</TableHead>
              <TableHead>{tx("admin.gst.irn.columns.customer")}</TableHead>
              <TableHead>{tx("admin.gst.irn.columns.route")}</TableHead>
              <TableHead>{tx("admin.gst.irn.columns.billDate")}</TableHead>
              <TableHead className="text-right">{tx("admin.gst.irn.columns.total")}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.billId}
                tabIndex={0}
                className="cursor-pointer"
                onClick={() => router.push(billPaperHref(row.billId))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    router.push(billPaperHref(row.billId));
                  }
                }}
              >
                <TableCell className="font-mono text-xs">{row.number}</TableCell>
                <TableCell>{row.customerShopName ?? "—"}</TableCell>
                <TableCell>
                  {row.routeName}{" "}
                  <span className="text-xs text-muted-foreground">({row.routeCode})</span>
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(row.billDate, "d MMM yyyy")}
                  {row.filedMonth && <FiledMonthBadge className="ml-2" />}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPaise(row.totalPaise)}
                </TableCell>
                <TableCell className="text-right">
                  <Button size="sm" variant="ghost" className="rounded-full" asChild>
                    <Link
                      href={billPaperHref(row.billId)}
                      onClick={(event) => event.stopPropagation()}
                    >
                      {tx("admin.gst.irn.open")}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
