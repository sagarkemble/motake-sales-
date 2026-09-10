"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarIcon, IndianRupeeIcon, PackageIcon, ShoppingCartIcon } from "lucide-react";
import { toast } from "sonner";

import { BackHeader } from "~/components/admin/products/back-header";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { KpiCard } from "~/components/admin/dashboard/kpi-card";
import { OrderList } from "~/components/admin/orders/order-list";
import { DeactivateCustomerDialog } from "~/components/admin/customers/deactivate-customer-dialog";
import { ShopPhotoThumbnail } from "~/components/shared/shop-photo-thumbnail";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { getErrorMessage } from "~/lib/get-error-message";
import { useCustomers } from "~/hooks/use-customers";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";

export default function CustomerDetailPage() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatInrCompact } = useFormatMoney();
  const params = useParams<{ id: string }>();
  const customerId = params.id;
  const router = useRouter();
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);

  const {
    customer,
    isCustomerLoading,
    customerStats,
    isCustomerStatsLoading,
    reactivateCustomerAsync,
    isReactivatingCustomer,
  } = useCustomers({
    customerId,
  });

  async function handleReactivate() {
    try {
      await reactivateCustomerAsync({ id: customerId });
      toast.success(tx("admin.customers.reactivateSuccess"));
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.customers.reactivateFailed")));
    }
  }

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

  const isInactive = customer.status === "inactive" || Boolean(customer.deletedAt);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-4">
      <BackHeader href="/admin/customers" title={customer.shopName} />

      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <ShopPhotoThumbnail
            shopPhotoUrl={customer.shopPhotoUrl}
            shopName={customer.shopName}
            size="lg"
            shape="rounded"
            className="rounded-2xl"
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">{customer.contactName ?? "No contact name"}</p>
              <StatusBadge status={customer.status} />
            </div>
            <p className="text-sm text-muted-foreground">{customer.phone}</p>
            <p className="text-sm text-muted-foreground">{customer.address}</p>
            {customer.notes && <p className="text-xs text-muted-foreground">{customer.notes}</p>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => router.push(`/admin/customers/${customer.id}/edit`)}
          >
            Edit
          </Button>
          {isInactive ? (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-brand text-brand hover:bg-brand/10"
              disabled={isReactivatingCustomer}
              onClick={handleReactivate}
            >
              {isReactivatingCustomer ? "Reactivating…" : "Reactivate"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="rounded-full border-destructive text-destructive hover:bg-destructive/10"
              onClick={() => setIsDeactivateOpen(true)}
            >
              Deactivate
            </Button>
          )}
        </div>
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
              label="admin.salesmen.kpi.itemsSold"
              value={customerStats?.totalQuantitySold ?? 0}
              icon={PackageIcon}
            />
            <KpiCard
              label="Total orders"
              value={customerStats?.totalOrderCount ?? 0}
              icon={ShoppingCartIcon}
            />
            <KpiCard
              label="Lifetime value"
              value={formatInrCompact(customerStats?.lifetimeValue ?? 0)}
              icon={IndianRupeeIcon}
            />
            <div className="col-span-2 flex items-center gap-3 rounded-2xl border bg-card p-3 sm:col-span-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand">
                <CalendarIcon className="size-4" />
              </div>
              <div>
                <p className="text-sm font-semibold leading-none">
                  {customerStats?.lastOrderAt
                    ? formatDate(new Date(customerStats.lastOrderAt), "d MMM yyyy")
                    : tx("admin.customers.ordersEmpty")}
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

      <DeactivateCustomerDialog
        customerId={customer.id}
        open={isDeactivateOpen}
        onOpenChange={setIsDeactivateOpen}
      />
    </div>
  );
}
