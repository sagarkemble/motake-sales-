"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { SearchIcon, StoreIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { useCustomers } from "~/hooks/use-customers";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";

function CustomersPageContent() {
  const router = useRouter();
  const pageSize = 20;
  const { page, setPage, searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();

  const { customersPage, isCustomersListLoading } = useCustomers({
    listFilters: { searchTerm: debouncedSearchTerm || undefined, page, pageSize },
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-base font-semibold">Customers</h1>
        <p className="text-xs text-muted-foreground">
          {isCustomersListLoading ? "Loading…" : `${customersPage.totalCount} total`}
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search by shop, contact, or phone"
          className="rounded-full bg-muted/40 pl-9 pr-9"
        />
        {searchTerm && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => setSearchTerm("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isCustomersListLoading ? (
          <ListItemSkeleton count={6} />
        ) : customersPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {debouncedSearchTerm
              ? `No customers match "${debouncedSearchTerm}"`
              : "No customers yet"}
          </p>
        ) : (
          customersPage.items.map((customer) => (
            <div
              key={customer.id}
              role="button"
              tabIndex={0}
              onClick={() => router.push(`/admin/customers/${customer.id}`)}
              onKeyDown={(event) => {
                if (event.key === "Enter") router.push(`/admin/customers/${customer.id}`);
              }}
              className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50"
            >
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted/40">
                <StoreIcon className="size-5 text-muted-foreground" />
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{customer.shopName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {customer.contactName ? `${customer.contactName} · ` : ""}
                  {customer.phone}
                </p>
              </div>

              <StatusBadge status={customer.status} />
            </div>
          ))
        )}
      </div>

      {customersPage.totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Page {customersPage.page} of {customersPage.totalPages}
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={customersPage.page <= 1}
              onClick={() => setPage(customersPage.page - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="rounded-full"
              disabled={customersPage.page >= customersPage.totalPages}
              onClick={() => setPage(customersPage.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function AdminCustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 px-4 py-4">
          <ListItemSkeleton count={6} />
        </div>
      }
    >
      <CustomersPageContent />
    </Suspense>
  );
}
