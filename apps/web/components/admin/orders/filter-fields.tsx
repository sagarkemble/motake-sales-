"use client";

import type { ReactNode } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { useCustomers } from "~/hooks/use-customers";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

// Sentinel for "no filter": Radix Select items cannot carry an empty value.
export const ALL = "all";
const MAX_PICKER_PAGE_SIZE = 200;

export function orUndefined(value: string) {
  return value === ALL || value === "" ? undefined : value;
}

interface FilterFieldProps {
  label: string;
  className?: string;
  children: ReactNode;
}

export function FilterField({ label, className, children }: FilterFieldProps) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1 text-xs text-muted-foreground", className)}>
      {label}
      {children}
    </label>
  );
}

interface FilterSelectProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function CustomerFilterSelect({ value, onValueChange }: FilterSelectProps) {
  const tx = useTranslate();
  const { customersPage } = useCustomers({
    listFilters: { includeInactive: true, page: 1, pageSize: MAX_PICKER_PAGE_SIZE },
  });

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full rounded-full bg-muted/40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{tx("admin.bills.allCustomers")}</SelectItem>
        {customersPage.items.map((customer) => (
          <SelectItem key={customer.id} value={customer.id}>
            {customer.shopName} · {customer.phone}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function SalesmanFilterSelect({ value, onValueChange }: FilterSelectProps) {
  const tx = useTranslate();
  const { salesmenPage } = useSalesmen({
    listFilters: { page: 1, pageSize: MAX_PICKER_PAGE_SIZE },
  });

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full rounded-full bg-muted/40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{tx("admin.bills.allSalesmen")}</SelectItem>
        {salesmenPage.items.map(({ salesman, profile }) => (
          <SelectItem key={salesman.id} value={salesman.id}>
            {profile.name ?? salesman.salesmanCode}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
