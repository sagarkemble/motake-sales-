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
import { useFormatMoney } from "~/hooks/use-format-money";
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
  totalCartAmount: number;
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
  totalCartAmount,
}: CustomerDetailsStepProps) {
  const tx = useTranslate();
  const { formatInr } = useFormatMoney();
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
        <p className="text-base font-semibold">{tx("Customer details")}</p>
        <p className="text-sm text-muted-foreground">
          {tx("Select an existing customer or enter new customer details.")}
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
        {tx("Open payment scanner")}
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
              <span className="text-muted-foreground">{tx("Search existing customers...")}</span>
            )}
            {selectedCustomer ? (
              <XIcon
                role="button"
                aria-label={tx("Clear selected customer")}
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
              placeholder={tx("Search existing customers...")}
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
                    {tx('No customer matches "{term}"', { term: customerSearchTerm })}
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
            {tx("Or enter new customer details")}
          </p>

          <div className="rounded-2xl border bg-card p-3">
            <Label className="mb-2 block">{tx("Shop photo *")}</Label>
            <ImageUpload
              imageUrl={newCustomerForm.shopPhotoUrl || null}
              requestUploadUrl={createShopPhotoUploadUrlAsync}
              altText="Shop"
              shape="square"
              uploadButtonLabel={tx("Upload shop photo")}
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
            <Label htmlFor="new-customer-shop-name">{tx("Shop name")}</Label>
            <Input
              id="new-customer-shop-name"
              placeholder={tx("Enter shop name")}
              value={newCustomerForm.shopName}
              onChange={(event) => onNewCustomerFormChange({ shopName: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-phone">{tx("Phone number")}</Label>
            <Input
              id="new-customer-phone"
              type="tel"
              placeholder={tx("Enter phone number")}
              value={newCustomerForm.phone}
              onChange={(event) => onNewCustomerFormChange({ phone: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-address">{tx("Address")}</Label>
            <Textarea
              id="new-customer-address"
              placeholder={tx("Enter full address")}
              value={newCustomerForm.address}
              onChange={(event) => onNewCustomerFormChange({ address: event.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border bg-card px-3 py-2 text-sm">
        <span className="text-muted-foreground">{tx("Place order for")}</span>
        <span className="font-semibold text-brand">{formatInr(totalCartAmount)}</span>
      </div>
    </div>
  );
}
