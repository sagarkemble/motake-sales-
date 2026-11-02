"use client";

import { AlertCircleIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { DatePicker } from "~/components/shared/date-picker";
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerRowType, LedgerSummary, OpenPreorder } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

import {
  DUE_CHIP,
  LEDGER_ROW_TYPES,
  NOTE_KINDS,
  businessToday,
  useBalanceText,
} from "./ledger-shared";

export interface LedgerFilters {
  types: LedgerRowType[];
  side: "all" | "debit" | "credit";
  from: string;
  to: string;
}

export const NO_FILTERS: LedgerFilters = { types: [], side: "all", from: "", to: "" };

export function filtersActive(filters: LedgerFilters) {
  return (
    filters.types.length > 0 || filters.side !== "all" || filters.from !== "" || filters.to !== ""
  );
}

function TypeFilter({
  value,
  onChange,
}: {
  value: LedgerRowType[];
  onChange: (types: LedgerRowType[]) => void;
}) {
  const tx = useTranslate();
  const label =
    value.length === 0
      ? tx("admin.ledger.filters.allTypes")
      : value.length === 1
        ? tx(`admin.ledger.rowTypes.${value[0]}`)
        : tx("admin.ledger.filters.typesCount", { count: value.length });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-between sm:w-48">
          <span className="truncate">{label}</span>
          <ChevronDownIcon className="size-4 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuItem onSelect={() => onChange([])}>
          {tx("admin.ledger.filters.allTypes")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange(NOTE_KINDS)}>
          {tx("admin.ledger.filters.notesOnly")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {tx("admin.ledger.filters.pickTypes")}
        </DropdownMenuLabel>
        {LEDGER_ROW_TYPES.map((type) => (
          <DropdownMenuCheckboxItem
            key={type}
            checked={value.includes(type)}
            onSelect={(event) => event.preventDefault()}
            onCheckedChange={(checked) =>
              onChange(checked ? [...value, type] : value.filter((item) => item !== type))
            }
          >
            {tx(`admin.ledger.rowTypes.${type}`)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FilterFields({
  filters,
  onChange,
}: {
  filters: LedgerFilters;
  onChange: (filters: LedgerFilters) => void;
}) {
  const tx = useTranslate();
  const today = businessToday();
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <div className="col-span-2 sm:col-span-1">
        <TypeFilter value={filters.types} onChange={(types) => onChange({ ...filters, types })} />
      </div>
      <div className="col-span-2 sm:col-span-1">
        <Select
          value={filters.side}
          onValueChange={(side) => onChange({ ...filters, side: side as LedgerFilters["side"] })}
        >
          <SelectTrigger
            size="sm"
            className="w-full sm:w-40"
            aria-label={tx("admin.ledger.filters.side")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tx("admin.ledger.filters.sideAll")}</SelectItem>
            <SelectItem value="debit">{tx("admin.ledger.filters.sideDebit")}</SelectItem>
            <SelectItem value="credit">{tx("admin.ledger.filters.sideCredit")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center">
        <Label htmlFor="ledger-filter-from" className="text-xs font-normal text-muted-foreground">
          {tx("admin.ledger.filters.from")}
        </Label>
        <DatePicker
          id="ledger-filter-from"
          value={filters.from}
          max={filters.to || today}
          clearable
          onChange={(from) => onChange({ ...filters, from })}
          className="w-full min-w-0 sm:w-44"
        />
      </div>
      <div className="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center">
        <Label htmlFor="ledger-filter-to" className="text-xs font-normal text-muted-foreground">
          {tx("admin.ledger.filters.to")}
        </Label>
        <DatePicker
          id="ledger-filter-to"
          value={filters.to}
          min={filters.from || undefined}
          max={today}
          clearable
          onChange={(to) => onChange({ ...filters, to })}
          className="w-full min-w-0 sm:w-44"
        />
      </div>
      {filtersActive(filters) && (
        <Button
          variant="ghost"
          size="sm"
          className="col-span-2 sm:col-span-1"
          onClick={() => onChange(NO_FILTERS)}
        >
          {tx("admin.ledger.filters.clear")}
        </Button>
      )}
    </div>
  );
}

export function LedgerFooter({ summary }: { summary: LedgerSummary }) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const { opening, currentTotal, closing } = summary.footer;
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{tx("admin.ledger.footer.hint")}</p>
      <div className="ml-auto grid w-full max-w-lg grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] gap-x-2 gap-y-1 text-sm sm:grid-cols-[minmax(0,1fr)_7.5rem_7.5rem]">
        <span />
        <span className="text-right text-xs text-muted-foreground">
          {tx("admin.ledger.columns.debit")}
        </span>
        <span className="text-right text-xs text-muted-foreground">
          {tx("admin.ledger.columns.credit")}
        </span>
        <span className="text-muted-foreground">{tx("admin.ledger.footer.opening")}</span>
        <span className="text-right tabular-nums">
          {opening.debitPaise ? formatPaise(opening.debitPaise) : ""}
        </span>
        <span className="text-right tabular-nums">
          {opening.creditPaise ? formatPaise(opening.creditPaise) : ""}
        </span>
        <span className="text-muted-foreground">{tx("admin.ledger.footer.currentTotal")}</span>
        <span className="text-right tabular-nums">{formatPaise(currentTotal.debitPaise)}</span>
        <span className="text-right tabular-nums">{formatPaise(currentTotal.creditPaise)}</span>
        <span className="font-medium">
          {tx("admin.ledger.footer.closing", {
            state: tx(`admin.ledger.balance.${closing.state}`),
          })}
        </span>
        <span className="text-right font-medium tabular-nums">
          {closing.state !== "advance" ? formatPaise(closing.amountPaise) : ""}
        </span>
        <span className="text-right font-medium tabular-nums">
          {closing.state === "advance" ? formatPaise(closing.amountPaise) : ""}
        </span>
      </div>
    </div>
  );
}

export function PreorderItem({ preorder }: { preorder: OpenPreorder }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  return (
    <Link
      href={`/admin/ledger/pre-orders/${preorder.id}`}
      className="flex items-start justify-between gap-3 rounded-2xl border bg-card shadow-sm p-3 text-sm transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <p className="font-medium">
          {tx("admin.ledger.preorders.forDate", {
            date: formatDate(preorder.scheduledDate, "d MMM yyyy"),
          })}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {preorder.lines.map((line) => `${line.quantity} × ${line.name}`).join(", ")}
        </p>
        {preorder.placedByName && (
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.preorders.by", { name: preorder.placedByName })}
          </p>
        )}
      </div>
      <Badge variant="outline" className={cn("shrink-0", DUE_CHIP[preorder.dueState])}>
        {tx(`admin.ledger.preorders.due.${preorder.dueState}`)}
      </Badge>
    </Link>
  );
}

export function AddMenu({
  summary,
  onOpening,
  onRaiseNote,
  onPayment,
  onRefund,
}: {
  summary: LedgerSummary;
  onOpening: () => void;
  onRaiseNote: () => void;
  onPayment: () => void;
  onRefund: () => void;
}) {
  const tx = useTranslate();
  const inactive = summary.customer.status === "inactive";
  // A Refund is paid only out of Advance; the server checks again under the Customer lock.
  const inAdvance = summary.footer.closing.state === "advance";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          disabled={inactive}
          title={inactive ? tx("admin.ledger.inactive.body") : undefined}
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <PlusIcon className="size-4" />
          {tx("admin.ledger.add.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem asChild>
          <Link href={`/admin/orders/new?customer=${summary.customer.id}`}>
            {tx("admin.ledger.add.newOrder")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRaiseNote}>
          {tx("admin.ledger.add.raiseNote")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onPayment}>{tx("admin.ledger.add.payment")}</DropdownMenuItem>
        <DropdownMenuItem disabled={!inAdvance} onSelect={onRefund}>
          {tx("admin.ledger.add.refund")}
          {!inAdvance && (
            <span className="ml-auto text-xs">{tx("admin.ledger.add.refundAdvanceOnly")}</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={summary.hasOpeningBalance} onSelect={onOpening}>
          {tx("admin.ledger.add.openingBalance")}
          {summary.hasOpeningBalance && (
            <span className="ml-auto text-xs">{tx("admin.ledger.add.openingAdded")}</span>
          )}
        </DropdownMenuItem>
        {!inAdvance && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
              {tx("admin.ledger.add.refundNeedsAdvance", {
                state: tx(`admin.ledger.balance.${summary.footer.closing.state}`),
              })}
            </DropdownMenuLabel>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InactiveBanner() {
  const tx = useTranslate();
  return (
    <Alert>
      <AlertCircleIcon />
      <AlertTitle>{tx("admin.ledger.inactive.title")}</AlertTitle>
      <AlertDescription>{tx("admin.ledger.inactive.body")}</AlertDescription>
    </Alert>
  );
}

const BALANCE_CHIP = {
  pending: "border-transparent bg-amber-500/10 text-amber-700",
  advance: "border-transparent bg-brand/10 text-brand",
  settled: "border-transparent bg-muted text-muted-foreground",
} as const;

export function BalanceChip({ summary }: { summary: LedgerSummary }) {
  const balanceText = useBalanceText();
  const closing = summary.footer.closing;
  return (
    <Badge variant="outline" className={cn("tabular-nums", BALANCE_CHIP[closing.state])}>
      {balanceText(closing)}
    </Badge>
  );
}

export function LedgerSkeleton({ rows = 8 }: { rows?: number }) {
  const tx = useTranslate();
  return (
    <div aria-busy="true" aria-label={tx("common.status.loading")}>
      <TableRowsSkeleton rows={rows} columns={4} />
    </div>
  );
}

export function LedgerError({ onRetry }: { onRetry: () => void }) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
      <p className="text-sm text-muted-foreground">{tx("admin.ledger.loadError.title")}</p>
      <Button type="button" variant="outline" className="rounded-full" onClick={onRetry}>
        {tx("common.actions.tryAgain")}
      </Button>
    </div>
  );
}

export function LedgerEmpty({
  filtered,
  canAdd,
  customerId,
  onClear,
  onOpening,
}: {
  filtered: boolean;
  canAdd: boolean;
  customerId: string;
  onClear: () => void;
  onOpening: () => void;
}) {
  const tx = useTranslate();
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <div>
        <p className="text-sm font-medium">
          {filtered ? tx("admin.ledger.empty.filteredTitle") : tx("admin.ledger.empty.title")}
        </p>
        <p className="text-sm text-muted-foreground">
          {filtered ? tx("admin.ledger.empty.filteredBody") : tx("admin.ledger.empty.body")}
        </p>
      </div>
      {filtered ? (
        <Button size="sm" variant="outline" className="rounded-full" onClick={onClear}>
          {tx("admin.ledger.filters.clear")}
        </Button>
      ) : (
        canAdd && (
          <div className="flex flex-wrap justify-center gap-2">
            <Button
              size="sm"
              className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={onOpening}
            >
              {tx("admin.ledger.empty.addOpening")}
            </Button>
            <Button size="sm" variant="outline" className="rounded-full" asChild>
              <Link href={`/admin/orders/new?customer=${customerId}`}>
                {tx("admin.ledger.add.newOrder")}
              </Link>
            </Button>
          </div>
        )
      )}
    </div>
  );
}
