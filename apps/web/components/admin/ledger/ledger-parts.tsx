"use client";

import { AlertCircleIcon, ChevronDownIcon, PlusIcon, ReceiptIcon } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
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
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "~/components/ui/empty";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { LedgerRowType, LedgerSummary, OpenPreorder } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

import { LEDGER_ROW_TYPES, NOTE_KINDS, businessToday, useBalanceText } from "./ledger-shared";

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
      <Label className="flex min-w-0 flex-col items-start gap-1 text-xs font-normal text-muted-foreground sm:flex-row sm:items-center">
        {tx("admin.ledger.filters.from")}
        <Input
          type="date"
          value={filters.from}
          max={filters.to || today}
          onChange={(event) => onChange({ ...filters, from: event.target.value })}
          className="h-8 w-full min-w-0 text-sm sm:w-40"
        />
      </Label>
      <Label className="flex min-w-0 flex-col items-start gap-1 text-xs font-normal text-muted-foreground sm:flex-row sm:items-center">
        {tx("admin.ledger.filters.to")}
        <Input
          type="date"
          value={filters.to}
          min={filters.from || undefined}
          max={today}
          onChange={(event) => onChange({ ...filters, to: event.target.value })}
          className="h-8 w-full min-w-0 text-sm sm:w-40"
        />
      </Label>
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

const DUE_BADGE = {
  overdue: "destructive",
  due: "default",
  upcoming: "secondary",
} as const;

export function PreorderItem({ preorder }: { preorder: OpenPreorder }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  return (
    <Link
      href={`/admin/ledger/pre-orders/${preorder.id}`}
      className="flex items-start justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm hover:border-brand/40"
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
      <Badge variant={DUE_BADGE[preorder.dueState]}>
        {tx(`admin.ledger.preorders.due.${preorder.dueState}`)}
      </Badge>
    </Link>
  );
}

export function AddMenu({
  summary,
  onOpening,
  onRaiseNote,
}: {
  summary: LedgerSummary;
  onOpening: () => void;
  onRaiseNote: () => void;
}) {
  const tx = useTranslate();
  const inactive = summary.customer.status === "inactive";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          disabled={inactive}
          title={inactive ? tx("admin.ledger.inactive.body") : undefined}
          className="bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <PlusIcon className="size-4" />
          {tx("admin.ledger.add.button")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem asChild>
          <Link href={`/admin/ledger/raise-bill?customer=${summary.customer.id}`}>
            {tx("admin.ledger.add.raiseBill")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onRaiseNote}>
          {tx("admin.ledger.add.raiseNote")}
        </DropdownMenuItem>
        <DropdownMenuItem disabled={summary.hasOpeningBalance} onSelect={onOpening}>
          {tx("admin.ledger.add.openingBalance")}
          {summary.hasOpeningBalance && (
            <span className="ml-auto text-xs">{tx("admin.ledger.add.openingAdded")}</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tx("admin.ledger.add.laterNote")}
        </DropdownMenuLabel>
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

export function BalanceChip({ summary }: { summary: LedgerSummary }) {
  const balanceText = useBalanceText();
  const closing = summary.footer.closing;
  return (
    <Badge variant={closing.state === "pending" ? "default" : "secondary"} className="tabular-nums">
      {balanceText(closing)}
    </Badge>
  );
}

export function LedgerSkeleton({ rows = 8 }: { rows?: number }) {
  const tx = useTranslate();
  return (
    <div className="space-y-2 p-3" aria-busy="true" aria-label={tx("common.status.loading")}>
      <Skeleton className="h-8 w-full" />
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-7 w-full" />
      ))}
      <Skeleton className="ml-auto h-20 w-full max-w-lg" />
    </div>
  );
}

export function LedgerError({ onRetry }: { onRetry: () => void }) {
  const tx = useTranslate();
  return (
    <div className="p-3">
      <Alert variant="destructive">
        <AlertCircleIcon />
        <AlertTitle>{tx("admin.ledger.loadError.title")}</AlertTitle>
        <AlertDescription>
          <p>{tx("admin.ledger.loadError.body")}</p>
          <Button size="sm" variant="outline" className="mt-2" onClick={onRetry}>
            {tx("common.actions.tryAgain")}
          </Button>
        </AlertDescription>
      </Alert>
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
    <Empty className="py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ReceiptIcon />
        </EmptyMedia>
        <EmptyTitle>
          {filtered ? tx("admin.ledger.empty.filteredTitle") : tx("admin.ledger.empty.title")}
        </EmptyTitle>
        <EmptyDescription>
          {filtered ? tx("admin.ledger.empty.filteredBody") : tx("admin.ledger.empty.body")}
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {filtered ? (
          <Button size="sm" variant="outline" onClick={onClear}>
            {tx("admin.ledger.filters.clear")}
          </Button>
        ) : (
          canAdd && (
            <div className="flex flex-wrap justify-center gap-2">
              <Button size="sm" onClick={onOpening}>
                {tx("admin.ledger.empty.addOpening")}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/admin/ledger/raise-bill?customer=${customerId}`}>
                  {tx("admin.ledger.add.raiseBill")}
                </Link>
              </Button>
            </div>
          )
        )}
      </EmptyContent>
    </Empty>
  );
}
