"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Badge } from "~/components/ui/badge";
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
import type { LedgerRow } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

import type { MoneyAdded } from "./money-dialogs";

// Each row opens its own paper: Bill, Note, Payment, Refund or the Opening paper.
export function openHref(row: LedgerRow, customerId: string): string | null {
  switch (row.open.kind) {
    case "bill":
      return `/admin/ledger/bills/${row.open.billId}`;
    case "note":
      return `/admin/ledger/notes/${row.open.noteId}`;
    case "payment":
      return `/admin/ledger/payments/${row.open.paymentId}`;
    case "refund":
      return `/admin/ledger/refunds/${row.open.refundId}`;
    case "opening_balance":
      return `/admin/ledger/opening/${customerId}`;
  }
}

// The row a Payment or Refund just added posted (not a later adjusted row of it).
function isAddedRow(row: LedgerRow, added: MoneyAdded | null | undefined) {
  if (!added || row.rowType !== added.kind) return false;
  if (row.open.kind === "payment") return row.open.paymentId === added.id;
  if (row.open.kind === "refund") return row.open.refundId === added.id;
  return false;
}

const HIGHLIGHT = "bg-brand-faint";

/** The Ledger rows: a table from `md` up, one card per row on phones. */
export function LedgerTable({
  rows,
  customerId,
  highlight,
}: {
  rows: LedgerRow[];
  customerId: string;
  // The row an Add just posted, shown highlighted and scrolled to.
  highlight?: MoneyAdded | null;
}) {
  const tx = useTranslate();
  const router = useRouter();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const tableRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const highlightedId = rows.find((row) => isAddedRow(row, highlight))?.id ?? null;

  useEffect(() => {
    if (!highlightedId) return;
    for (const container of [tableRef.current, listRef.current]) {
      const element = container?.querySelector<HTMLElement>(`[data-row-id="${highlightedId}"]`);
      // Only the visible layout (table or phone list) has a box to scroll to.
      if (element && element.offsetParent !== null) {
        element.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }, [highlightedId]);

  function open(row: LedgerRow) {
    const href = openHref(row, customerId);
    if (href) router.push(href);
  }

  const typeLabel = (row: LedgerRow) => (
    <>
      {tx(`admin.ledger.rowTypes.${row.rowType}`)}
      {row.cancelled && (
        <Badge
          variant="outline"
          className="ml-2 border-transparent bg-destructive/10 text-destructive"
        >
          {tx("admin.ledger.cancelled")}
        </Badge>
      )}
    </>
  );

  return (
    <>
      <div ref={tableRef} className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{tx("admin.ledger.columns.date")}</TableHead>
              <TableHead>{tx("admin.ledger.columns.details")}</TableHead>
              <TableHead>{tx("admin.ledger.columns.type")}</TableHead>
              <TableHead>{tx("admin.ledger.columns.number")}</TableHead>
              <TableHead className="text-right">{tx("admin.ledger.columns.debit")}</TableHead>
              <TableHead className="text-right">{tx("admin.ledger.columns.credit")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const opens = openHref(row, customerId) !== null;
              return (
                <TableRow
                  key={row.id}
                  data-row-id={row.id}
                  tabIndex={opens ? 0 : undefined}
                  className={cn(
                    opens && "cursor-pointer hover:bg-accent",
                    row.id === highlightedId && HIGHLIGHT,
                  )}
                  onClick={() => open(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(row);
                    }
                  }}
                >
                  <TableCell className="whitespace-nowrap">
                    {formatDate(row.date, "d MMM yyyy")}
                  </TableCell>
                  <TableCell className="max-w-[18rem]">
                    <span className="block truncate">
                      {tx(`admin.ledger.details.${row.rowType}`)}
                    </span>
                    {row.reason && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.reason}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{typeLabel(row)}</TableCell>
                  <TableCell className="font-mono text-xs">{row.number ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.debitPaise != null ? formatPaise(row.debitPaise) : ""}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.creditPaise != null ? formatPaise(row.creditPaise) : ""}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <ul ref={listRef} className="flex flex-col gap-2 p-3 md:hidden">
        {rows.map((row) => (
          <li
            key={row.id}
            data-row-id={row.id}
            className={cn(
              "overflow-hidden rounded-2xl border bg-card shadow-sm",
              row.id === highlightedId && HIGHLIGHT,
            )}
          >
            <button
              type="button"
              disabled={openHref(row, customerId) === null}
              className="flex w-full items-start justify-between gap-3 p-3 text-left transition-colors hover:bg-accent disabled:cursor-default disabled:hover:bg-transparent"
              onClick={() => open(row)}
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium">{typeLabel(row)}</span>
                <span className="block text-xs text-muted-foreground">
                  {formatDate(row.date, "d MMM yyyy")}
                  {row.number && ` · ${row.number}`}
                </span>
                {row.reason && (
                  <span className="block truncate text-xs text-muted-foreground">{row.reason}</span>
                )}
              </span>
              <span className="shrink-0 text-right text-sm tabular-nums">
                {row.debitPaise != null ? (
                  <span>
                    {tx("admin.ledger.dr")} {formatPaise(row.debitPaise)}
                  </span>
                ) : (
                  <span className="text-brand">
                    {tx("admin.ledger.cr")} {formatPaise(row.creditPaise ?? 0)}
                  </span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
