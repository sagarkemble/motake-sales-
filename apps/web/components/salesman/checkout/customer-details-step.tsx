"use client";

import { useState } from "react";

import {
  ChevronDownIcon,
  InfoIcon,
  PhoneIcon,
  SearchIcon,
  SearchXIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Skeleton } from "~/components/ui/skeleton";
import { CustomerDetailDrawer } from "~/components/salesman/checkout/customer-detail-drawer";
import { NoActiveGatepassNotice } from "~/components/salesman/checkout/no-active-gatepass-notice";
import {
  NewCustomerFields,
  type NewCustomerFormValues,
} from "~/components/salesman/customers/new-customer-fields";
import { BalanceChip } from "~/components/shared/checkout/balance-text";
import { RouteTag } from "~/components/shared/route-tag";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import type { ActiveGatepassRoute, CheckoutCustomer } from "~/hooks/salesman/use-checkout-wizard";
import { useTranslate } from "~/hooks/use-translate";

interface CustomerDetailsStepProps {
  activeGatepassRoute: ActiveGatepassRoute | null;
  isActiveGatepassLoading: boolean;
  handedOverRouteName: string | null;
  customerSearchTerm: string;
  onCustomerSearchTermChange: (searchTerm: string) => void;
  customerOptions: CheckoutCustomer[];
  customerTotalCount: number;
  isCustomerListLoading: boolean;
  selectedCustomer: CheckoutCustomer | null;
  onSelectCustomer: (customer: CheckoutCustomer) => void;
  onClearSelectedCustomer: () => void;
  newCustomerForm: NewCustomerFormValues;
  onNewCustomerFormChange: (fieldValues: Partial<NewCustomerFormValues>) => void;
  totalCartQuantity: number;
}

export function CustomerDetailsStep({
  activeGatepassRoute,
  isActiveGatepassLoading,
  handedOverRouteName,
  customerSearchTerm,
  onCustomerSearchTermChange,
  customerOptions,
  customerTotalCount,
  isCustomerListLoading,
  selectedCustomer,
  onSelectCustomer,
  onClearSelectedCustomer,
  newCustomerForm,
  onNewCustomerFormChange,
  totalCartQuantity,
}: CustomerDetailsStepProps) {
  const tx = useTranslate();
  const [isAddCustomerOpen, setIsAddCustomerOpen] = useState(false);
  const [openedCustomerId, setOpenedCustomerId] = useState<string | null>(null);

  function handleUseCustomer(customer: CheckoutCustomer) {
    onSelectCustomer(customer);
    setOpenedCustomerId(null);
    setIsAddCustomerOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("salesman.checkout.customer.title")}</p>
        <p className="text-sm text-muted-foreground">
          {activeGatepassRoute
            ? tx("salesman.checkout.customer.routeHint", { route: activeGatepassRoute.name })
            : tx("salesman.checkout.customer.hint")}
        </p>
      </div>

      {isActiveGatepassLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : !activeGatepassRoute ? (
        <>
          <NoActiveGatepassNotice handedOverRouteName={handedOverRouteName} context="customers" />
          <NoActiveGatepassNotice
            handedOverRouteName={handedOverRouteName}
            context="addCustomer"
            compact
          />
        </>
      ) : selectedCustomer ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand bg-accent p-3">
          <ShopPhotoThumbnail
            shopPhotoUrl={selectedCustomer.shopPhotoUrl}
            shopName={selectedCustomer.shopName}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selectedCustomer.shopName}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedCustomer.address}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <RouteTag name={selectedCustomer.routeName} code={selectedCustomer.routeCode} />
              <BalanceChip balancePaise={selectedCustomer.balancePaise} />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="self-end rounded-full text-muted-foreground"
              aria-label={tx("salesman.checkout.customer.detailTitle")}
              onClick={() => setOpenedCustomerId(selectedCustomer.id)}
            >
              <InfoIcon className="size-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              onClick={onClearSelectedCustomer}
            >
              {tx("common.actions.change")}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={customerSearchTerm}
              onChange={(event) => onCustomerSearchTermChange(event.target.value)}
              placeholder={tx("salesman.checkout.customer.searchPlaceholder")}
              className="h-11 rounded-full bg-muted-soft pl-9 pr-11"
            />
            {customerSearchTerm && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={tx("common.actions.clearSearch")}
                onClick={() => onCustomerSearchTermChange("")}
                className="absolute right-1.5 top-1/2 size-8 -translate-y-1/2 rounded-full text-muted-foreground"
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {isCustomerListLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-20 rounded-2xl" />
              ))
            ) : customerOptions.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
                <SearchXIcon className="size-6 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {customerSearchTerm
                    ? tx("salesman.checkout.customer.noMatchOnRoute", {
                        route: activeGatepassRoute.name,
                        term: customerSearchTerm,
                      })
                    : tx("salesman.checkout.customer.noneOnRoute", {
                        route: activeGatepassRoute.name,
                      })}
                </p>
                <p className="text-xs text-muted-foreground">
                  {tx("salesman.checkout.customer.onlyRouteListed")}
                </p>
                {customerSearchTerm && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-1 rounded-full"
                    onClick={() => {
                      onNewCustomerFormChange({ shopName: customerSearchTerm });
                      setIsAddCustomerOpen(true);
                    }}
                  >
                    {tx("salesman.checkout.customer.addAsNew", { term: customerSearchTerm })}
                  </Button>
                )}
              </div>
            ) : (
              <>
                <p className="px-1 text-[11px] text-muted-foreground">
                  {tx("salesman.checkout.customer.countOnRoute", {
                    count: customerTotalCount,
                    route: activeGatepassRoute.name,
                  })}
                </p>
                {customerOptions.map((customer) => (
                  <div
                    key={customer.id}
                    className="flex items-start gap-2 rounded-2xl border bg-card shadow-sm p-3 transition-colors hover:bg-accent"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => onSelectCustomer(customer)}
                      className="h-auto min-w-0 flex-1 items-start justify-start gap-3 whitespace-normal rounded-xl p-0 text-left font-normal hover:bg-transparent"
                    >
                      <ShopPhotoThumbnail
                        shopPhotoUrl={customer.shopPhotoUrl}
                        shopName={customer.shopName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{customer.shopName}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {customer.address}
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <RouteTag name={customer.routeName} code={customer.routeCode} />
                          <BalanceChip balancePaise={customer.balancePaise} />
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <PhoneIcon className="size-3" />
                            {customer.phone}
                          </span>
                        </div>
                      </div>
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="shrink-0 rounded-full text-muted-foreground"
                      aria-label={tx("salesman.checkout.customer.detailTitle")}
                      onClick={() => setOpenedCustomerId(customer.id)}
                    >
                      <InfoIcon className="size-4" />
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>

          <Collapsible
            open={isAddCustomerOpen}
            onOpenChange={setIsAddCustomerOpen}
            className="rounded-2xl border bg-card shadow-sm"
          >
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="group h-auto w-full justify-between whitespace-normal rounded-2xl px-3 py-3 text-left text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <UserPlusIcon className="size-4 shrink-0 text-brand" />
                  {tx("salesman.checkout.customer.orEnterNew")}
                </span>
                <ChevronDownIcon className="size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="border-t p-3">
                <NewCustomerFields
                  routeName={activeGatepassRoute.name}
                  newCustomerForm={newCustomerForm}
                  onNewCustomerFormChange={onNewCustomerFormChange}
                />
              </div>
            </CollapsibleContent>
          </Collapsible>
        </>
      )}

      <div className="flex items-center justify-between rounded-2xl border bg-card shadow-sm px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {tx("salesman.checkout.customer.placeOrderFor")}
        </span>
        <span className="font-semibold text-brand">
          {tx("salesman.orders.qty", { count: totalCartQuantity })}
        </span>
      </div>

      <CustomerDetailDrawer
        customerId={openedCustomerId}
        onOpenChange={(isOpen) => {
          if (!isOpen) setOpenedCustomerId(null);
        }}
        onUseCustomer={handleUseCustomer}
      />
    </div>
  );
}
