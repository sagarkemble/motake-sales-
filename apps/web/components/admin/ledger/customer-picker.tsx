"use client";

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useCustomers } from "~/hooks/use-customers";
import { useRoutes } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { useDebouncedValue } from "~/hooks/shared/use-debounced-value";
import { cn } from "~/lib/utils";

const ALL_ROUTES = "all";
const PICKER_PAGE_SIZE = 50;

interface CustomerPickerProps {
  value: string | null;
  // Shown on the trigger before the list has loaded the chosen Customer.
  selectedLabel?: string;
  onChange: (customerId: string) => void;
}

/**
 * One Ledger at a time: a Route filter plus a searchable Customer list (shop name or phone).
 * Deactivated Customers are listed too, since their Ledger still reads.
 */
export function CustomerPicker({ value, selectedLabel, onChange }: CustomerPickerProps) {
  const tx = useTranslate();
  const [open, setOpen] = useState(false);
  const [routeFilter, setRouteFilter] = useState(ALL_ROUTES);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebouncedValue(searchTerm.trim(), 300);

  const { routes } = useRoutes({ listFilters: { includeHidden: true } });
  const { customersPage, isCustomersListLoading } = useCustomers({
    listFilters: {
      searchTerm: debouncedSearchTerm || undefined,
      routeId: routeFilter === ALL_ROUTES ? undefined : routeFilter,
      includeInactive: true,
      page: 1,
      pageSize: PICKER_PAGE_SIZE,
    },
  });
  const selected = customersPage.items.find((customer) => customer.id === value);

  return (
    <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
      <Select value={routeFilter} onValueChange={setRouteFilter}>
        <SelectTrigger aria-label={tx("admin.ledger.picker.route")} className="w-full sm:w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ROUTES}>{tx("admin.ledger.picker.allRoutes")}</SelectItem>
          {routes.map((route) => (
            <SelectItem key={route.id} value={route.id}>
              {route.name} · {route.code}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={tx("admin.ledger.picker.placeholder")}
            className="w-full justify-between font-normal sm:w-80"
          >
            <span className="truncate">
              {selected
                ? `${selected.shopName} · ${selected.phone}`
                : value && selectedLabel
                  ? selectedLabel
                  : tx("admin.ledger.picker.placeholder")}
            </span>
            <ChevronsUpDownIcon className="ml-2 size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] p-0"
        >
          {/* The server searches; the list is shown as returned. */}
          <Command shouldFilter={false}>
            <CommandInput
              value={searchTerm}
              onValueChange={setSearchTerm}
              placeholder={tx("admin.ledger.picker.search")}
            />
            <CommandList>
              <CommandEmpty>
                {isCustomersListLoading
                  ? tx("common.status.loading")
                  : tx("admin.ledger.picker.empty")}
              </CommandEmpty>
              <CommandGroup>
                {customersPage.items.map((customer) => (
                  <CommandItem
                    key={customer.id}
                    value={customer.id}
                    onSelect={() => {
                      onChange(customer.id);
                      setOpen(false);
                    }}
                  >
                    <CheckIcon
                      className={cn("size-4", customer.id === value ? "opacity-100" : "opacity-0")}
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {customer.shopName}
                      <span className="text-muted-foreground"> · {customer.phone}</span>
                      {customer.status === "inactive" && (
                        <span className="text-muted-foreground">
                          {" "}
                          · {tx("admin.ledger.picker.deactivated")}
                        </span>
                      )}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
