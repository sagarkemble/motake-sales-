"use client";

import { useRouter } from "next/navigation";

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

// Bills and Notes open the Bill paper; Payment, Refund and Opening papers come with Spec H.
export function openHref(row: LedgerRow): string | null {
  if (row.open.kind === "bill") return `/admin/ledger/bills/${row.open.billId}`;
  if (row.open.kind === "note")
    return `/admin/ledger/bills/${row.open.billId}#note-${row.open.noteId}`;
  return null;
}

/** The Ledger rows: a table from `sm` up, one card per row on phones. */
export function LedgerTable({ rows }: { rows: LedgerRow[] }) {
  const tx = useTranslate();
  const router = useRouter();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  function open(row: LedgerRow) {
    const href = openHref(row);
    if (href) router.push(href);
  }

  const typeLabel = (row: LedgerRow) => (
    <>
      {tx(`admin.ledger.rowTypes.${row.rowType}`)}
      {row.cancelled && (
        <Badge variant="outline" className="ml-2">
          {tx("admin.ledger.cancelled")}
        </Badge>
      )}
    </>
  );

  return (
    <>
      <div className="hidden sm:block">
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
              const opens = openHref(row) !== null;
              return (
                <TableRow
                  key={row.id}
                  tabIndex={opens ? 0 : undefined}
                  className={cn(opens && "cursor-pointer")}
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
      <ul className="divide-y sm:hidden">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              disabled={openHref(row) === null}
              className="flex w-full items-start justify-between gap-3 px-3 py-2.5 text-left disabled:cursor-default"
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
                  <span className="text-emerald-700 dark:text-emerald-400">
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
