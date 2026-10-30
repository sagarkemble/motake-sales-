"use client";

import { businessDateOf } from "@repo/trpc/client";
import { ChevronRightIcon, SearchIcon, SearchXIcon, UserPlusIcon, XIcon } from "lucide-react";
import { useState } from "react";

import { NoActiveGatepassNotice } from "~/components/salesman/checkout/no-active-gatepass-notice";
import { AddCustomerDrawer } from "~/components/salesman/customers/add-customer-drawer";
import { RouteCustomerDrawer } from "~/components/salesman/customers/route-customer-drawer";
import { BalanceChip } from "~/components/shared/checkout/balance-text";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { ListPager } from "~/components/shared/list-pager";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useCustomers } from "~/hooks/use-customers";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh } from "~/providers/page-refresh-provider";

const CUSTOMERS_PAGE_SIZE = 20;

/** Customers on the Active GatePass Route with their Balance; field Payment starts here. */
export default function SalesmanRouteCustomersPage() {
  const tx = useTranslate();
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [openedCustomerId, setOpenedCustomerId] = useState<string | null>(null);
  const [isAddingCustomer, setIsAddingCustomer] = useState(false);
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 350);

  const { myGatepass, isMyGatepassLoading, refetchMyGatepass, isMyGatepassFetching } = useGatepasses({
    businessDate: businessDateOf(new Date()),
    includeMyGatepass: true,
  });
  const activeRouteName =
    myGatepass?.gatepass.status === "active" ? myGatepass.gatepass.routeName : null;

  const { customersPage, isCustomersListLoading, refetchCustomersList, isCustomersListFetching } =
    useCustomers({
      listFilters: {
        searchTerm: debouncedSearchTerm || undefined,
        page,
        pageSize: CUSTOMERS_PAGE_SIZE,
      },
      enabled: Boolean(activeRouteName),
    });
  // Customers load only on an Active GatePass Route.
  usePageRefresh(
    () => Promise.all([refetchMyGatepass(), activeRouteName ? refetchCustomersList() : null]),
    isMyGatepassFetching || isCustomersListFetching,
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-4 py-4 md:px-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold">{tx("salesman.customers.title")}</p>
          <p className="text-sm text-muted-foreground">
            {activeRouteName
              ? tx("salesman.checkout.customer.routeHint", { route: activeRouteName })
              : tx("salesman.customers.hint")}
          </p>
        </div>
        {/* A salesman's Customer goes on their Active GatePass Route, so none can be added without one. */}
        {activeRouteName && (
          <Button
            type="button"
            size="sm"
            className="shrink-0 gap-1.5 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => setIsAddingCustomer(true)}
          >
            <UserPlusIcon className="size-4" />
            {tx("salesman.customers.add")}
          </Button>
        )}
      </div>

      {isMyGatepassLoading ? (
        <ListItemSkeleton count={4} />
      ) : !activeRouteName ? (
        <NoActiveGatepassNotice
          handedOverRouteName={myGatepass ? myGatepass.gatepass.routeName : null}
          context="customers"
        />
      ) : (
        <>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setPage(1);
              }}
              placeholder={tx("salesman.checkout.customer.searchPlaceholder")}
              className="h-11 rounded-full bg-muted/40 pl-9 pr-11"
            />
            {searchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={tx("common.actions.clearSearch")}
                onClick={() => {
                  setSearchTerm("");
                  setPage(1);
                }}
                className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 rounded-full text-muted-foreground"
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>

          {isCustomersListLoading ? (
            <ListItemSkeleton count={5} />
          ) : customersPage.items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
              <SearchXIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">
                {debouncedSearchTerm
                  ? tx("salesman.checkout.customer.noMatchOnRoute", {
                      route: activeRouteName,
                      term: debouncedSearchTerm,
                    })
                  : tx("salesman.checkout.customer.noneOnRoute", { route: activeRouteName })}
              </p>
              <p className="text-xs text-muted-foreground">
                {tx("salesman.checkout.customer.onlyRouteListed")}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {customersPage.items.map((customer) => (
                <Button
                  key={customer.id}
                  type="button"
                  variant="outline"
                  className="h-auto justify-between gap-3 whitespace-normal rounded-2xl bg-card p-3 text-left font-normal shadow-none hover:bg-accent/50"
                  onClick={() => setOpenedCustomerId(customer.id)}
                >
                  <ShopPhotoThumbnail
                    shopPhotoUrl={customer.shopPhotoUrl}
                    shopName={customer.shopName}
                    size="md"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{customer.shopName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {customer.address}
                    </span>
                    <BalanceChip balancePaise={customer.balancePaise} className="mt-1" />
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Button>
              ))}
            </div>
          )}

          <ListPager
            page={customersPage.page}
            totalPages={customersPage.totalPages}
            onPageChange={setPage}
          />
        </>
      )}

      {isAddingCustomer && activeRouteName && (
        <AddCustomerDrawer routeName={activeRouteName} onClose={() => setIsAddingCustomer(false)} />
      )}

      {openedCustomerId && (
        <RouteCustomerDrawer
          key={openedCustomerId}
          customerId={openedCustomerId}
          onClose={() => setOpenedCustomerId(null)}
        />
      )}
    </div>
  );
}
