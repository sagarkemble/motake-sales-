"use client";

import { SearchIcon } from "lucide-react";
import { useState } from "react";
import { TRPCClientError, type RouterOutputs } from "@repo/trpc/client";

import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { BillDetailDialog } from "~/components/admin/bills/bill-detail-dialog";
import {
  ALL,
  CustomerFilterSelect,
  FilterField,
  SalesmanFilterSelect,
  orUndefined,
} from "~/components/admin/orders/filter-fields";
import { OrderDetailDialog } from "~/components/admin/orders/order-detail-dialog";
import { DatePicker } from "~/components/shared/date-picker";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useBills } from "~/hooks/use-bills";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { getErrorMessage } from "~/lib/get-error-message";
import { cn } from "~/lib/utils";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

type BillListRow = RouterOutputs["bills"]["list"]["data"]["items"][number];

export function BillList() {
  const tx = useTranslate();
  const [page, setPage] = useState(1);
  const [numberSearch, setNumberSearch] = useState("");
  const [billDateFrom, setBillDateFrom] = useState("");
  const [billDateTo, setBillDateTo] = useState("");
  const [hideCancelled, setHideCancelled] = useState(false);
  const [customerId, setCustomerId] = useState(ALL);
  const [salesmanId, setSalesmanId] = useState(ALL);
  const [lookupNumber, setLookupNumber] = useState("");
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState<string | null>(null);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const isFiltered =
    numberSearch.trim() !== "" ||
    billDateFrom !== "" ||
    billDateTo !== "" ||
    hideCancelled ||
    customerId !== ALL ||
    salesmanId !== ALL;

  function clearFilters() {
    setNumberSearch("");
    setBillDateFrom("");
    setBillDateTo("");
    setHideCancelled(false);
    setCustomerId(ALL);
    setSalesmanId(ALL);
    setPage(1);
  }
  const debouncedNumberSearch = useDebouncedValue(numberSearch.trim(), 350);
  const pageSize = 20;

  const { billsPage, isBillsListLoading, findBillByNumber, refetchBillsList, isBillsListFetching } =
    useBills({
      listFilters: {
        customerId: orUndefined(customerId),
        salesmanId: orUndefined(salesmanId),
        numberSearch: debouncedNumberSearch || undefined,
        billDateFrom: billDateFrom || undefined,
        billDateTo: billDateTo || undefined,
        hideCancelled,
        page,
        pageSize,
      },
    });
  usePageRefresh(refetchBillsList, isBillsListFetching);
  const isReloading = usePageReloading();

  async function handleLookup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const number = lookupNumber.trim();
    if (!number) return;

    setIsLookingUp(true);
    setLookupError(null);
    try {
      const bill = await findBillByNumber(number);
      setSelectedBillId(bill.id);
    } catch (error) {
      setLookupError(
        error instanceof TRPCClientError && error.data?.code === "NOT_FOUND"
          ? tx("admin.bills.lookupMiss", { number })
          : getErrorMessage(tx, error, tx("admin.bills.lookupFailed")),
      );
    } finally {
      setIsLookingUp(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleLookup} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
        <p className="text-sm font-medium">{tx("admin.bills.lookupTitle")}</p>
        <div className="flex gap-2">
          <Input
            value={lookupNumber}
            onChange={(event) => setLookupNumber(event.target.value)}
            placeholder="MB/26-27/000123"
            maxLength={16}
            className="font-mono"
          />
          <Button
            type="submit"
            disabled={isLookingUp || !lookupNumber.trim()}
            className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <SearchIcon className="size-4" />
            {tx("admin.bills.lookupOpen")}
          </Button>
        </div>
        {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
      </form>

      <div className="grid grid-cols-2 gap-2 rounded-2xl border bg-card p-3 sm:grid-cols-3 lg:grid-cols-5">
        <FilterField label={tx("admin.bills.numberSearch")} className="col-span-2 sm:col-span-1">
          <Input
            value={numberSearch}
            onChange={(event) => {
              setNumberSearch(event.target.value);
              setPage(1);
            }}
            placeholder="000123"
            className="font-mono"
          />
        </FilterField>
        <FilterField label={tx("admin.bills.customer")}>
          <CustomerFilterSelect
            value={customerId}
            onValueChange={(value) => {
              setCustomerId(value);
              setPage(1);
            }}
          />
        </FilterField>
        <FilterField label={tx("admin.bills.salesman")}>
          <SalesmanFilterSelect
            value={salesmanId}
            onValueChange={(value) => {
              setSalesmanId(value);
              setPage(1);
            }}
          />
        </FilterField>
        <FilterField label={tx("admin.bills.billDateFrom")}>
          <DatePicker
            value={billDateFrom}
            clearable
            onChange={(value) => {
              setBillDateFrom(value);
              setPage(1);
            }}
          />
        </FilterField>
        <FilterField label={tx("admin.bills.billDateTo")}>
          <DatePicker
            value={billDateTo}
            clearable
            onChange={(value) => {
              setBillDateTo(value);
              setPage(1);
            }}
          />
        </FilterField>
        <label className="col-span-2 flex items-center gap-2 text-sm sm:col-span-3 lg:col-span-5">
          <Checkbox
            checked={hideCancelled}
            onCheckedChange={(checked) => {
              setHideCancelled(checked === true);
              setPage(1);
            }}
          />
          {tx("admin.bills.hideCancelled")}
        </label>
      </div>

      {isBillsListLoading || (isReloading && isBillsListFetching) ? (
        <ListItemSkeleton count={5} />
      ) : billsPage.items.length === 0 ? (
        isFiltered ? (
          <EmptyStateCard
            title={tx("empty.filtered.title")}
            body={tx("empty.filtered.body")}
            action={{ label: tx("empty.actions.clearFilters"), onClick: clearFilters }}
          />
        ) : (
          <EmptyStateCard
            title={tx("empty.bills.title")}
            body={tx("empty.bills.body")}
            action={{ label: tx("empty.actions.newOrder"), href: "/admin/orders/new" }}
          />
        )
      ) : (
        <>
          <BillTable rows={billsPage.items} onSelect={setSelectedBillId} />
          <div className="flex flex-col gap-2 md:hidden">
            {billsPage.items.map((row) => (
              <BillCard key={row.id} row={row} onSelect={setSelectedBillId} />
            ))}
          </div>
        </>
      )}

      <ListPager page={billsPage.page} totalPages={billsPage.totalPages} onPageChange={setPage} />

      <BillDetailDialog
        billId={selectedBillId}
        onOpenChange={(open) => !open && setSelectedBillId(null)}
        onOpenOrder={(orderId) => {
          setSelectedBillId(null);
          setSelectedOrderId(orderId);
        }}
      />
      <OrderDetailDialog
        orderId={selectedOrderId}
        onOpenChange={(open) => !open && setSelectedOrderId(null)}
      />
    </div>
  );
}

function BillNumber({ row }: { row: BillListRow }) {
  return (
    <span className="flex items-center gap-2">
      <span
        className={cn("font-mono text-sm", row.cancelled && "text-muted-foreground line-through")}
      >
        {row.number}
      </span>
      {row.cancelled && <OrderStatusBadge status="cancelled" />}
    </span>
  );
}

function BillTotal({ row }: { row: BillListRow }) {
  const { formatPaise } = useFormatMoney();
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        row.cancelled ? "text-muted-foreground line-through" : "text-brand",
      )}
    >
      {formatPaise(row.totalPaise)}
    </span>
  );
}

function sourceKey(row: BillListRow) {
  return row.orderId ? "admin.bills.source.order" : "admin.bills.source.office";
}

function BillTable({ rows, onSelect }: { rows: BillListRow[]; onSelect: (id: string) => void }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <div className="hidden overflow-hidden rounded-2xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{tx("admin.bills.number")}</TableHead>
            <TableHead>{tx("admin.bills.billDate")}</TableHead>
            <TableHead>{tx("admin.bills.customer")}</TableHead>
            <TableHead>{tx("admin.bills.type")}</TableHead>
            <TableHead>{tx("admin.bills.source.title")}</TableHead>
            <TableHead className="text-right">{tx("common.units.qty")}</TableHead>
            <TableHead className="text-right">{tx("admin.bills.total")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow
              key={row.id}
              onClick={() => onSelect(row.id)}
              className="cursor-pointer hover:bg-accent"
            >
              <TableCell>
                <BillNumber row={row} />
              </TableCell>
              <TableCell>{formatDate(row.billDate, "d MMM yyyy")}</TableCell>
              <TableCell>{row.customerShopName ?? "—"}</TableCell>
              <TableCell className="text-xs">
                {tx(`admin.bills.legalType.${row.legalType}`)}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">{tx(sourceKey(row))}</TableCell>
              <TableCell className="text-right tabular-nums">{row.totalQuantity}</TableCell>
              <TableCell className="text-right">
                <BillTotal row={row} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function BillCard({ row, onSelect }: { row: BillListRow; onSelect: (id: string) => void }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent"
    >
      <div className="min-w-0">
        <BillNumber row={row} />
        <p className="truncate text-sm">{row.customerShopName ?? "—"}</p>
        <p className="text-xs text-muted-foreground">
          {formatDate(row.billDate, "d MMM yyyy")} · {tx(`admin.bills.legalType.${row.legalType}`)}{" "}
          · {tx(sourceKey(row))}
        </p>
      </div>
      <div className="shrink-0 text-right text-sm">
        <BillTotal row={row} />
        <p className="text-xs font-bold text-muted-foreground">
          {row.totalQuantity} {tx("common.units.qty")}
        </p>
      </div>
    </button>
  );
}
