"use client";

import { SearchIcon, StoreIcon } from "lucide-react";

import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { Input } from "~/components/ui/input";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { useCustomers } from "~/hooks/use-customers";
import { useState } from "react";

const CUSTOMER_PICKER_PAGE_SIZE = 20;

interface CustomerOption {
  id: string;
  shopName: string;
  phone: string;
  address: string;
}

interface CustomerPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectCustomer: (customer: CustomerOption) => void;
}

export function CustomerPickerDrawer({
  open,
  onOpenChange,
  onSelectCustomer,
}: CustomerPickerDrawerProps) {
  const [searchInputValue, setSearchInputValue] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchInputValue, 350);

  const { customersPage, isCustomersListLoading } = useCustomers({
    listFilters: { searchTerm: debouncedSearchTerm || undefined, page: 1, pageSize: CUSTOMER_PICKER_PAGE_SIZE },
    enabled: open,
  });

  function handleSelect(customer: CustomerOption) {
    onSelectCustomer(customer);
    onOpenChange(false);
    setSearchInputValue("");
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Choose customer</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-3 px-4 pb-4">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Search shop name or phone..."
              value={searchInputValue}
              onChange={(event) => setSearchInputValue(event.target.value)}
              className="rounded-full bg-muted/40 pl-9"
            />
          </div>

          <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto">
            {isCustomersListLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>
            ) : customersPage.items.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {debouncedSearchTerm ? `No customer matches "${debouncedSearchTerm}"` : "No customers yet"}
              </p>
            ) : (
              customersPage.items.map((customer) => (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => handleSelect(customer)}
                  className="flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors active:bg-muted/40"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted/40">
                    <StoreIcon className="size-5 text-muted-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{customer.shopName}</p>
                    <p className="truncate text-xs text-muted-foreground">{customer.phone}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
