"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { RouteTag } from "~/components/shared/route-tag";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { useCustomers } from "~/hooks/use-customers";
import { useRoutes } from "~/hooks/use-routes";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

const ALL_ROUTES = "all";

function CustomersPageContent() {
  const tx = useTranslate();
  const router = useRouter();
  const pageSize = 20;
  const { page, setPage, searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [includeInactive, setIncludeInactive] = useState(false);
  const [routeFilter, setRouteFilter] = useState(ALL_ROUTES);

  // Hidden Routes too: their Customers are still listed, so Admin can find and move them.
  const { routes, refetchRoutesList, isRoutesListFetching } = useRoutes({
    listFilters: { includeHidden: true },
  });
  const { customersPage, isCustomersListLoading, refetchCustomersList, isCustomersListFetching } =
    useCustomers({
      listFilters: {
        searchTerm: debouncedSearchTerm || undefined,
        routeId: routeFilter === ALL_ROUTES ? undefined : routeFilter,
        page,
        pageSize,
        includeInactive,
      },
    });
  usePageRefresh(
    () => Promise.all([refetchCustomersList(), refetchRoutesList()]),
    isCustomersListFetching || isRoutesListFetching,
  );
  const isReloading = usePageReloading();

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-4 sm:px-6">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder={tx("admin.customers.searchPlaceholder")}
            className="rounded-full bg-muted-soft pl-9 pr-9"
          />
          {searchTerm && (
            <button
              type="button"
              aria-label={tx("common.actions.clearSearch")}
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 text-muted-foreground hover:text-foreground"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <Button
          asChild
          size="icon"
          className="size-9 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          <Link href="/admin/customers/new" aria-label={tx("admin.customers.newAria")}>
            <PlusIcon />
          </Link>
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          value={routeFilter}
          onValueChange={(nextRouteFilter) => {
            setRouteFilter(nextRouteFilter);
            setPage(1);
          }}
        >
          <SelectTrigger
            aria-label={tx("admin.customers.routeFilter")}
            className="w-full rounded-full bg-muted-soft sm:w-64"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_ROUTES}>{tx("admin.customers.allRoutes")}</SelectItem>
            {routes.map((route) => (
              <SelectItem key={route.id} value={route.id}>
                {route.name} · {route.code}
                {route.hidden && ` (${tx("admin.routes.deleted")})`}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={includeInactive}
            onCheckedChange={(checked) => {
              setIncludeInactive(checked === true);
              setPage(1);
            }}
            className="data-[state=checked]:border-brand data-[state=checked]:bg-brand"
          />
          {tx("admin.customers.showInactive")}
        </label>
      </div>

      <p className="text-xs text-muted-foreground">
        {isCustomersListLoading || (isReloading && isCustomersListFetching)
          ? tx("common.status.loading")
          : tx("admin.customers.totalCount", { count: customersPage.totalCount })}
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {isCustomersListLoading || (isReloading && isCustomersListFetching) ? (
          <ListItemSkeleton count={6} />
        ) : customersPage.items.length === 0 ? (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            {debouncedSearchTerm
              ? tx("admin.customers.noMatch", { term: debouncedSearchTerm })
              : tx("admin.customers.empty")}
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
              className="flex cursor-pointer items-center gap-3 rounded-2xl border bg-card p-3 text-left outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <ShopPhotoThumbnail
                shopPhotoUrl={customer.shopPhotoUrl}
                shopName={customer.shopName}
                size="md"
                shape="circle"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{customer.shopName}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {customer.contactName ? `${customer.contactName} · ` : ""}
                  {customer.phone}
                </p>
                <RouteTag
                  name={customer.routeName}
                  code={customer.routeCode}
                  hidden={customer.routeHidden}
                  className="mt-0.5"
                />
              </div>

              <StatusBadge status={customer.status} />
            </div>
          ))
        )}
      </div>

      <ListPager
        page={customersPage.page}
        totalPages={customersPage.totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}

export default function AdminCustomersPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-4 sm:px-6">
          <ListItemSkeleton count={6} />
        </div>
      }
    >
      <CustomersPageContent />
    </Suspense>
  );
}
