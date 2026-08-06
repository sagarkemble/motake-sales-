import { CheckIcon, SearchIcon, StoreIcon } from "lucide-react";

import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";

interface CustomerOption {
  id: string;
  shopName: string;
  phone: string;
}

interface NewCustomerFormValues {
  shopName: string;
  phone: string;
  address: string;
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
}: CustomerDetailsStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">Customer details</p>
        <p className="text-sm text-muted-foreground">
          Select an existing customer or enter new customer details.
        </p>
      </div>

      <div className="relative">
        <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search existing customers..."
          value={customerSearchTerm}
          onChange={(event) => onCustomerSearchTermChange(event.target.value)}
          className="rounded-full bg-muted/40 pl-9"
        />
      </div>

      {customerSearchTerm && (
        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {isCustomerListLoading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Loading</p>
          ) : customerOptions.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No customer matches &quot;{customerSearchTerm}&quot;
            </p>
          ) : (
            customerOptions.map((customer) => {
              const isSelected = selectedCustomer?.id === customer.id;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => onSelectCustomer(customer)}
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors",
                    isSelected ? "border-brand bg-brand/5" : "border-border bg-card",
                  )}
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                    <StoreIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.shopName}</p>
                    <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
                  </div>
                  {isSelected && <CheckIcon className="size-4 shrink-0 text-brand" />}
                </button>
              );
            })
          )}
        </div>
      )}

      {selectedCustomer ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand bg-brand/5 p-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
            <StoreIcon className="size-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedCustomer.shopName}</p>
            <p className="truncate text-xs text-muted-foreground">{selectedCustomer.phone}</p>
          </div>
          <button
            type="button"
            onClick={onClearSelectedCustomer}
            className="shrink-0 text-xs text-brand"
          >
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-muted-foreground">Or enter new customer details</p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-shop-name">Shop name</Label>
            <Input
              id="new-customer-shop-name"
              placeholder="Enter shop name"
              value={newCustomerForm.shopName}
              onChange={(event) => onNewCustomerFormChange({ shopName: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-phone">Phone number</Label>
            <Input
              id="new-customer-phone"
              type="tel"
              placeholder="Enter phone number"
              value={newCustomerForm.phone}
              onChange={(event) => onNewCustomerFormChange({ phone: event.target.value })}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-customer-address">Address</Label>
            <Textarea
              id="new-customer-address"
              placeholder="Enter full address"
              value={newCustomerForm.address}
              onChange={(event) => onNewCustomerFormChange({ address: event.target.value })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
