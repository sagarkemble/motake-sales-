"use client";

import { ChevronRightIcon } from "lucide-react";

import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
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
import type { Gstr1Filing } from "~/hooks/use-gst";
import { useTranslate } from "~/hooks/use-translate";

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
