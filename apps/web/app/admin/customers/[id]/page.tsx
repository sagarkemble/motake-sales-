"use client";

import { useParams } from "next/navigation";
import { format } from "date-fns";
import { CalendarIcon, PackageIcon, ShoppingCartIcon } from "lucide-react";

import { BackHeader } from "~/components/admin/products/back-header";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { KpiCard } from "~/components/admin/dashboard/kpi-card";
import { OrderList } from "~/components/admin/orders/order-list";
import { Skeleton } from "~/components/ui/skeleton";
import { useCustomers } from "~/hooks/use-customers";

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const customerId = params.id;

  const { customer, isCustomerLoading, customerStats, isCustomerStatsLoading } = useCustomers({
    customerId,
  });

  if (isCustomerLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
        <Skeleton className="h-9 w-40 rounded-full" />
        <Skeleton className="h-24 rounded-2xl" />
        <div className="grid grid-cols-2 gap-3">
          <Skeleton className="h-16 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return <div className="p-4 text-sm text-muted-foreground">Customer not found</div>;
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/customers" title={customer.shopName} />

      <div className="flex flex-col gap-2 rounded-2xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{customer.contactName ?? "No contact name"}</p>
          <StatusBadge status={customer.status} />
        </div>
        <p className="text-sm text-muted-foreground">{customer.phone}</p>
        <p className="text-sm text-muted-foreground">{customer.address}</p>
        {customer.notes && <p className="text-xs text-muted-foreground">{customer.notes}</p>}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Lifetime stats</h2>
        {isCustomerStatsLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl sm:col-span-1 col-span-2" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Items sold"
              value={customerStats?.totalQuantitySold ?? 0}
              icon={PackageIcon}
            />
            <KpiCard
              label="Total orders"
              value={customerStats?.totalOrderCount ?? 0}
              icon={ShoppingCartIcon}
            />
            <div className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-3 sm:col-span-1">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CalendarIcon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  {customerStats?.lastOrderAt
                    ? format(new Date(customerStats.lastOrderAt), "d MMM yyyy")
                    : "No orders yet"}
                </p>
                <p className="text-xs text-muted-foreground">Last order</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Order history</h2>
        <OrderList customerId={customer.id} />
      </div>
    </div>
  );
}
