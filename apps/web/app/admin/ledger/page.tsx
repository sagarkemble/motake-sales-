"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { CustomerPicker } from "~/components/admin/ledger/customer-picker";
import {
  AddMoneyDialog,
  type MoneyAddKind,
  type MoneyAdded,
} from "~/components/admin/ledger/money-dialogs";
import {
  OpeningBalanceDialog,
  PickBillForNoteDialog,
} from "~/components/admin/ledger/ledger-dialogs";
import {
  AddMenu,
  BalanceChip,
  FilterFields,
  InactiveBanner,
  LedgerEmpty,
  LedgerError,
  LedgerFooter,
  LedgerSkeleton,
  NO_FILTERS,
  PreorderItem,
  filtersActive,
  type LedgerFilters,
} from "~/components/admin/ledger/ledger-parts";
import { LEDGER_RETURN_KEY, LEDGER_ROW_TYPES } from "~/components/admin/ledger/ledger-shared";
import { LedgerTable } from "~/components/admin/ledger/ledger-table";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { useLedger, type LedgerRowType } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

const PAGE_SIZE = 25;

function filtersFrom(searchParams: URLSearchParams): LedgerFilters {
  const side = searchParams.get("side");
  return {
    types: (searchParams.get("types") ?? "")
      .split(",")
      .filter((type): type is LedgerRowType => LEDGER_ROW_TYPES.includes(type as LedgerRowType)),
    side: side === "debit" || side === "credit" ? side : "all",
    from: searchParams.get("from") ?? "",
    to: searchParams.get("to") ?? "",
  };
}

function LedgerPageContent() {
  const tx = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const customerId = searchParams.get("customer");
  const filters = filtersFrom(searchParams);
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [moneyAdd, setMoneyAdd] = useState<MoneyAddKind | null>(null);
  // The Payment or Refund just added: highlighted on the table, which turns to the last page once.
  const [added, setAdded] = useState<MoneyAdded | null>(null);
  const [jumpToAdded, setJumpToAdded] = useState(false);

  const {
    rowsPage,
    isRowsLoading,
    isRowsFetching,
    isRowsError,
    refetchRows,
    summary,
    isSummaryLoading,
    isSummaryError,
    refetchSummary,
    isSummaryFetching,
    openPreorders,
    refetchOpenPreorders,
    isOpenPreordersFetching,
  } = useLedger({
    customerId: customerId ?? undefined,
    rowFilters: {
      types: filters.types.length > 0 ? filters.types : undefined,
      side: filters.side === "all" ? undefined : filters.side,
      from: filters.from || undefined,
      to: filters.to || undefined,
      page,
      pageSize: PAGE_SIZE,
    },
  });
  // The Ledger's queries run only once a Customer is picked.
  usePageRefresh(
    () => Promise.all([refetchSummary(), refetchRows(), refetchOpenPreorders()]),
    isSummaryFetching || isRowsFetching || isOpenPreordersFetching,
    Boolean(customerId),
  );
  const isReloading = usePageReloading();

  useEffect(() => {
    try {
      sessionStorage.setItem(LEDGER_RETURN_KEY, `${pathname}?${searchParams.toString()}`);
    } catch {
      // Storage off: Back falls back to the plain Ledger link.
    }
  }, [pathname, searchParams]);

  function replaceQuery(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function setFilters(next: LedgerFilters) {
    replaceQuery({
      types: next.types.length > 0 ? next.types.join(",") : null,
      side: next.side === "all" ? null : next.side,
      from: next.from || null,
      to: next.to || null,
      page: null,
    });
  }

  // A new row posts last; when the refetched page does not hold it, turn to the last page once.
  useEffect(() => {
    // Wait for the rows the Add's refetch brings; the cached page is from before it.
    if (!jumpToAdded || isRowsFetching || !added) return;
    setJumpToAdded(false);
    const onPage = rowsPage.items.some(
      (row) =>
        (row.open.kind === "payment" && row.open.paymentId === added.id) ||
        (row.open.kind === "refund" && row.open.refundId === added.id),
    );
    if (onPage || rowsPage.page >= rowsPage.totalPages) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(rowsPage.totalPages));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }, [jumpToAdded, isRowsFetching, added, rowsPage, searchParams, pathname, router]);

  function handleMoneyAdded(next: MoneyAdded) {
    setMoneyAdd(null);
    setAdded(next);
    setJumpToAdded(true);
  }

  // Switching Customer closes any open paper and starts on a clean table.
  function setCustomer(nextCustomerId: string) {
    setOpeningOpen(false);
    setNoteOpen(false);
    setMoneyAdd(null);
    setAdded(null);
    setJumpToAdded(false);
    router.replace(`${pathname}?customer=${nextCustomerId}`, { scroll: false });
  }

  const inactive = summary?.customer.status === "inactive";
  const isLoading =
    isSummaryLoading || isRowsLoading || (isReloading && (isSummaryFetching || isRowsFetching));
  const isError = isSummaryError || isRowsError;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <CustomerPicker
          value={customerId}
          selectedLabel={
            summary ? `${summary.customer.shopName} · ${summary.customer.phone}` : undefined
          }
          onChange={setCustomer}
        />
        {summary && (
          <div className="flex items-center justify-between gap-2 lg:justify-end">
            <BalanceChip summary={summary} />
            <AddMenu
              summary={summary}
              onOpening={() => setOpeningOpen(true)}
              onRaiseNote={() => setNoteOpen(true)}
              onPayment={() => setMoneyAdd("payment")}
              onRefund={() => setMoneyAdd("refund")}
            />
          </div>
        )}
      </div>

      {!customerId ? (
        <div className="rounded-2xl border border-dashed px-4 py-10 text-center">
          <p className="text-sm font-medium">{tx("admin.ledger.pickCustomerTitle")}</p>
          <p className="text-sm text-muted-foreground">{tx("admin.ledger.pickCustomerHint")}</p>
        </div>
      ) : (
        <>
          {inactive && <InactiveBanner />}

          {openPreorders.length > 0 && (
            <section className="rounded-2xl border bg-card p-3">
              <p className="mb-2 text-sm font-medium">
                {tx("admin.ledger.preorders.title")}{" "}
                <span className="text-muted-foreground">
                  {tx("admin.ledger.preorders.notOnLedger")}
                </span>
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {openPreorders.map((preorder) => (
                  <PreorderItem key={preorder.id} preorder={preorder} />
                ))}
              </div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border bg-card">
            {isLoading ? (
              <LedgerSkeleton />
            ) : isError || !summary ? (
              <LedgerError
                onRetry={() => {
                  void refetchSummary();
                  void refetchRows();
                }}
              />
            ) : (
              <>
                <header className="flex items-center justify-between gap-3 border-b px-3 py-2">
                  <p className="truncate text-sm">
                    <span className="font-medium">{summary.customer.shopName}</span>
                    <span className="text-muted-foreground">
                      {" "}
                      · {summary.customer.routeName} ({summary.customer.routeCode}) ·{" "}
                      {summary.customer.phone}
                    </span>
                  </p>
                </header>
                <div className="border-b px-3 py-2">
                  <FilterFields filters={filters} onChange={setFilters} />
                </div>
                {rowsPage.items.length === 0 ? (
                  <LedgerEmpty
                    filtered={filtersActive(filters)}
                    canAdd={!inactive && !summary.hasOpeningBalance}
                    customerId={summary.customer.id}
                    onClear={() => setFilters(NO_FILTERS)}
                    onOpening={() => setOpeningOpen(true)}
                  />
                ) : (
                  <>
                    <LedgerTable
                      rows={rowsPage.items}
                      customerId={summary.customer.id}
                      highlight={added}
                    />
                    <div className="border-t px-3 pb-2">
                      <p className="pt-2 text-xs text-muted-foreground">
                        {tx("admin.ledger.rowsCount", { count: rowsPage.totalCount })}
                      </p>
                      <ListPager
                        page={rowsPage.page}
                        totalPages={rowsPage.totalPages}
                        onPageChange={(nextPage) => replaceQuery({ page: String(nextPage) })}
                      />
                    </div>
                  </>
                )}
                <footer className="border-t px-3 py-3">
                  <LedgerFooter summary={summary} />
                </footer>
              </>
            )}
          </section>

          {summary && (
            <>
              <OpeningBalanceDialog
                open={openingOpen}
                onOpenChange={setOpeningOpen}
                customerId={summary.customer.id}
                shopName={summary.customer.shopName}
              />
              <AddMoneyDialog
                kind={moneyAdd}
                onOpenChange={(open) => !open && setMoneyAdd(null)}
                summary={summary}
                onAdded={handleMoneyAdded}
              />
              <PickBillForNoteDialog
                key={summary.customer.id}
                open={noteOpen}
                onOpenChange={setNoteOpen}
                customerId={summary.customer.id}
                shopName={summary.customer.shopName}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

export default function AdminLedgerPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
          <ListItemSkeleton count={4} />
        </div>
      }
    >
      <LedgerPageContent />
    </Suspense>
  );
}
