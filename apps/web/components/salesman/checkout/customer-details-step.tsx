"use client";

import { useState } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
  InfoIcon,
  MapPinIcon,
  PhoneIcon,
  QrCodeIcon,
  RouteIcon,
  SearchIcon,
  SearchXIcon,
  UserPlusIcon,
  XIcon,
} from "lucide-react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { Skeleton } from "~/components/ui/skeleton";
import { CustomerDetailDrawer } from "~/components/salesman/checkout/customer-detail-drawer";
import { NoActiveGatepassNotice } from "~/components/salesman/checkout/no-active-gatepass-notice";
import { PaymentScannerDialog } from "~/components/salesman/checkout/payment-scanner-dialog";
import { ImageUpload } from "~/components/shared/image-upload";
import { PreferredLanguagePicker } from "~/components/shared/preferred-language-picker";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import type {
  ActiveGatepassRoute,
  CheckoutCustomer,
  NewCustomerFormValues,
} from "~/hooks/salesman/use-checkout-wizard";
import { useCustomers } from "~/hooks/use-customers";
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
  const [isScannerOpen, setIsScannerOpen] = useState(false);
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

      <Button
        type="button"
        variant="outline"
        size="lg"
        className="group h-14 w-full gap-3 rounded-2xl border-brand/30 bg-accent text-base font-semibold text-brand-deep hover:border-brand/50 hover:bg-accent/70"
        onClick={() => setIsScannerOpen(true)}
      >
        <QrCodeIcon className="size-6 transition-transform duration-[var(--duration-base)] ease-[var(--ease-standard)] group-hover:scale-110 group-hover:rotate-6" />
        {tx("salesman.checkout.customer.openScanner")}
      </Button>

      <PaymentScannerDialog open={isScannerOpen} onOpenChange={setIsScannerOpen} />

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
        <div className="flex items-center gap-3 rounded-2xl border border-brand bg-accent/50 p-3">
          <ShopPhotoThumbnail
            shopPhotoUrl={selectedCustomer.shopPhotoUrl}
            shopName={selectedCustomer.shopName}
            size="md"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{selectedCustomer.shopName}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedCustomer.address}</p>
            <RouteChip routeName={selectedCustomer.routeName} />
          </div>
          <div className="flex flex-col gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={tx("salesman.checkout.customer.detailTitle")}
              onClick={() => setOpenedCustomerId(selectedCustomer.id)}
            >
              <InfoIcon className="size-4" />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={onClearSelectedCustomer}>
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
              className="h-11 rounded-full bg-muted/40 pl-9 pr-9"
            />
            {customerSearchTerm && (
              <button
                type="button"
                aria-label={tx("common.actions.clearSearch")}
                onClick={() => onCustomerSearchTermChange("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              >
                <XIcon className="size-4" />
              </button>
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
                    className="flex items-start gap-3 rounded-2xl border bg-card p-3 transition-colors hover:border-brand/40"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectCustomer(customer)}
                      className="flex min-w-0 flex-1 items-start gap-3 text-left"
                    >
                      <ShopPhotoThumbnail
                        shopPhotoUrl={customer.shopPhotoUrl}
                        shopName={customer.shopName}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{customer.shopName}</p>
                        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
                          <MapPinIcon className="mt-0.5 size-3 shrink-0" />
                          <span className="line-clamp-2">{customer.address}</span>
                        </p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <RouteChip routeName={customer.routeName} />
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                            <PhoneIcon className="size-3" />
                            {customer.phone}
                          </span>
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={tx("salesman.checkout.customer.detailTitle")}
                      onClick={() => setOpenedCustomerId(customer.id)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted"
                    >
                      <InfoIcon className="size-4" />
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>

          <div className="rounded-2xl border bg-card">
            <button
              type="button"
              onClick={() => setIsAddCustomerOpen((isOpen) => !isOpen)}
              className="flex w-full items-center justify-between px-3 py-3 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <UserPlusIcon className="size-4 text-brand" />
                {tx("salesman.checkout.customer.orEnterNew")}
              </span>
              {isAddCustomerOpen ? (
                <ChevronUpIcon className="size-4" />
              ) : (
                <ChevronDownIcon className="size-4" />
              )}
            </button>
            {isAddCustomerOpen && (
              <div className="border-t p-3">
                <NewCustomerFields
                  routeName={activeGatepassRoute.name}
                  newCustomerForm={newCustomerForm}
                  onNewCustomerFormChange={onNewCustomerFormChange}
                />
              </div>
            )}
          </div>
        </>
      )}

      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
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

function RouteChip({ routeName }: { routeName: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-medium text-brand-deep">
      <RouteIcon className="size-3 shrink-0" />
      <span className="truncate">{routeName}</span>
    </span>
  );
}

/** Salesman Add Customer: no Route picker (the Active GatePass Route) and no GSTIN. */
function NewCustomerFields({
  routeName,
  newCustomerForm,
  onNewCustomerFormChange,
}: {
  routeName: string;
  newCustomerForm: NewCustomerFormValues;
  onNewCustomerFormChange: (fieldValues: Partial<NewCustomerFormValues>) => void;
}) {
  const tx = useTranslate();
  const { createShopPhotoUploadUrlAsync } = useCustomers();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-2xl border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
        <RouteIcon className="size-4 shrink-0 text-brand" />
        <span>{tx("salesman.checkout.customer.addedOnRoute", { route: routeName })}</span>
      </div>

      <div className="rounded-2xl border bg-card p-3">
        <Label className="mb-2 block">{tx("salesman.checkout.customer.shopPhoto")}</Label>
        <ImageUpload
          imageUrl={newCustomerForm.shopPhotoUrl || null}
          requestUploadUrl={createShopPhotoUploadUrlAsync}
          altText={tx("admin.customers.form.shopPhoto")}
          shape="square"
          uploadButtonLabel={tx("salesman.checkout.customer.uploadPhoto")}
          onUploaded={(result) =>
            onNewCustomerFormChange({
              shopPhotoKey: result.imageKey,
              shopPhotoUrl: result.imageUrl,
            })
          }
          onDelete={
            newCustomerForm.shopPhotoUrl
              ? async () =>
                  onNewCustomerFormChange({
                    shopPhotoKey: "",
                    shopPhotoUrl: "",
                  })
              : undefined
          }
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-customer-shop-name">{tx("salesman.checkout.customer.shopName")}</Label>
        <Input
          id="new-customer-shop-name"
          placeholder={tx("salesman.checkout.customer.shopNamePlaceholder")}
          value={newCustomerForm.shopName}
          onChange={(event) => onNewCustomerFormChange({ shopName: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-customer-phone">{tx("common.fields.phone")}</Label>
        <Input
          id="new-customer-phone"
          type="tel"
          placeholder={tx("salesman.checkout.customer.phonePlaceholder")}
          value={newCustomerForm.phone}
          onChange={(event) => onNewCustomerFormChange({ phone: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-customer-address">{tx("common.fields.address")}</Label>
        <Textarea
          id="new-customer-address"
          placeholder={tx("salesman.checkout.customer.addressPlaceholder")}
          value={newCustomerForm.address}
          onChange={(event) => onNewCustomerFormChange({ address: event.target.value })}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-customer-language">{tx("common.preferredLanguage.label")}</Label>
        <PreferredLanguagePicker
          id="new-customer-language"
          value={newCustomerForm.preferredLanguage}
          onValueChange={(preferredLanguage) => onNewCustomerFormChange({ preferredLanguage })}
        />
      </div>
    </div>
  );
}
