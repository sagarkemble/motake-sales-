"use client";

import { useState } from "react";

import { CheckIcon, ChevronsUpDownIcon, QrCodeIcon, XIcon } from "lucide-react";

import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { Textarea } from "~/components/ui/textarea";
import { PaymentScannerDialog } from "~/components/salesman/checkout/payment-scanner-dialog";
import { ImageUpload } from "~/components/shared/image-upload";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Skeleton } from "~/components/ui/skeleton";
import { useCustomers } from "~/hooks/use-customers";
import { useTranslate } from "~/hooks/use-translate";

interface CustomerOption {
  id: string;
  shopName: string;
  phone: string;
  shopPhotoUrl?: string | null;
}

interface NewCustomerFormValues {
  shopName: string;
  phone: string;
  address: string;
  shopPhotoKey: string;
  shopPhotoUrl: string;
}

interface CustomerDetailsStepProps {
  customerSearchTerm: string;
  onCustomerSearchTermChange: (searchTerm: string) => void;
  customerOptions: CustomerOption[];
  isCustomerListLoading: boolean;
  selectedCustomer: CustomerOption | null;
  onSelectCustomer: (customer: CustomerOption) => void;
  onClearSelectedCustomer: () => void;
  newCustomerForm: NewCustomerFormValues;
  onNewCustomerFormChange: (fieldValues: Partial<NewCustomerFormValues>) => void;
  totalCartQuantity: number;
}

export function CustomerDetailsStep({
  customerSearchTerm,
  onCustomerSearchTermChange,
  customerOptions,
  isCustomerListLoading,
  selectedCustomer,
  onSelectCustomer,
  onClearSelectedCustomer,
  newCustomerForm,
  onNewCustomerFormChange,
  totalCartQuantity,
}: CustomerDetailsStepProps) {
  const tx = useTranslate();
  const [isComboboxOpen, setIsComboboxOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const { createShopPhotoUploadUrlAsync } = useCustomers();

  function handleSelectCustomer(customer: CustomerOption) {
    onSelectCustomer(customer);
    setIsComboboxOpen(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("salesman.checkout.customer.title")}</p>
        <p className="text-sm text-muted-foreground">{tx("salesman.checkout.customer.hint")}</p>
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

      <Popover open={isComboboxOpen} onOpenChange={setIsComboboxOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={isComboboxOpen}
            className="h-auto justify-between rounded-full bg-muted/40 px-4 py-2 font-normal"
          >
            {selectedCustomer ? (
              <span className="flex min-w-0 items-center gap-2">
                <ShopPhotoThumbnail
                  shopPhotoUrl={selectedCustomer.shopPhotoUrl}
                  shopName={selectedCustomer.shopName}
                  size="sm"
                />
                <span className="truncate">{selectedCustomer.shopName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {selectedCustomer.phone}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {tx("salesman.checkout.customer.searchPlaceholder")}
              </span>
            )}
            {selectedCustomer ? (
              <XIcon
                role="button"
                aria-label={tx("salesman.checkout.customer.clearSelected")}
                className="ml-2 size-4 shrink-0 opacity-50 hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onClearSelectedCustomer();
                }}
              />
            ) : (
              <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={tx("salesman.checkout.customer.searchPlaceholder")}
              value={customerSearchTerm}
              onValueChange={onCustomerSearchTermChange}
            />
            <CommandList className="max-h-64">
              {isCustomerListLoading ? (
                <div className="flex flex-col gap-3 p-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Skeleton className="size-8 shrink-0 rounded-lg" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    {tx("salesman.checkout.customer.noMatch", { term: customerSearchTerm })}
                  </CommandEmpty>
                  <CommandGroup>
                    {customerOptions.map((customer) => {
                      const isSelected = selectedCustomer?.id === customer.id;
                      return (
                        <CommandItem
                          key={customer.id}
                          value={customer.id}
                          onSelect={() => handleSelectCustomer(customer)}
                          className="gap-3"
                        >
                          <ShopPhotoThumbnail
                            shopPhotoUrl={customer.shopPhotoUrl}
                            shopName={customer.shopName}
                            size="sm"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{customer.shopName}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {customer.phone}
                            </p>
                          </div>
                          {isSelected && <CheckIcon className="size-4 shrink-0 text-brand" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {!selectedCustomer && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">
            {tx("salesman.checkout.customer.orEnterNew")}
          </p>

          <div className="rounded-2xl border bg-card p-3">
            <Label className="mb-2 block">{tx("salesman.checkout.customer.shopPhoto")}</Label>
            <ImageUpload
              imageUrl={newCustomerForm.shopPhotoUrl || null}
              requestUploadUrl={createShopPhotoUploadUrlAsync}
              altText="Shop"
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
            <Label htmlFor="new-customer-shop-name">
              {tx("salesman.checkout.customer.shopName")}
            </Label>
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
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">
          {tx("salesman.checkout.customer.placeOrderFor")}
        </span>
        <span className="font-semibold text-brand">
          {tx("salesman.orders.qty", { count: totalCartQuantity })}
        </span>
      </div>
    </div>
  );
}
