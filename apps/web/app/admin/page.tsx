"use client";

import { endOfDay, format, startOfDay } from "date-fns";
import {
  CheckCircleIcon,
  ClockIcon,
  PackagePlusIcon,
  RotateCcwIcon,
  ShoppingCartIcon,
  StoreIcon,
  TicketIcon,
  TriangleAlertIcon,
  UserPlusIcon,
} from "lucide-react";

import { KpiCard } from "~/components/admin/dashboard/kpi-card";
import { QuickActionLink } from "~/components/admin/dashboard/quick-action-link";
import { Skeleton } from "~/components/ui/skeleton";
import { useReports } from "~/hooks/use-reports";

export default function AdminDashboardPage() {
  const today = new Date();

  const { dailyKpiSummary, isDailyKpiSummaryLoading } = useReports({
    dailyKpiFilters: {
      businessDate: format(today, "yyyy-MM-dd"),
      placedFrom: startOfDay(today),
      placedTo: endOfDay(today),
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s orders</h2>
        {isDailyKpiSummaryLoading ? (
          <div className="grid grid-cols-3 gap-3">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            <KpiCard
              label="Book now"
              value={dailyKpiSummary?.bookNowOrderCount ?? 0}
              icon={ShoppingCartIcon}
            />
            <KpiCard label="Pre-orders" value={dailyKpiSummary?.preOrderCount ?? 0} icon={ClockIcon} />
            <KpiCard
              label="Fulfilled"
              value={dailyKpiSummary?.fulfilledOrderCount ?? 0}
              icon={CheckCircleIcon}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s gate passes</h2>
        {isDailyKpiSummaryLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
            <Skeleton className="h-16 rounded-2xl" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Issued qty"
              value={dailyKpiSummary?.gatepassTotals.totalIssuedQty ?? 0}
              icon={TicketIcon}
            />
            <KpiCard
              label="Sold qty"
              value={dailyKpiSummary?.gatepassTotals.totalSoldQty ?? 0}
              icon={CheckCircleIcon}
            />
            <KpiCard
              label="Returned qty"
              value={dailyKpiSummary?.gatepassTotals.totalReturnedQty ?? 0}
              icon={RotateCcwIcon}
            />
            <KpiCard
              label="Discrepancies"
              value={dailyKpiSummary?.gatepassTotals.discrepancyGatepassCount ?? 0}
              icon={TriangleAlertIcon}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="flex flex-col gap-2 sm:grid sm:grid-cols-2">
          <QuickActionLink href="/gatepass" label="Allot Gate Passes" icon={TicketIcon} />
          <QuickActionLink href="/admin/products/new" label="Add Product" icon={PackagePlusIcon} />
          <QuickActionLink href="/admin/salesman/new" label="Add Salesman" icon={UserPlusIcon} />
          <QuickActionLink href="/admin/customers" label="View Customers" icon={StoreIcon} />
          <QuickActionLink href="/admin/orders" label="View Orders" icon={ShoppingCartIcon} />
        </div>
      </section>
    </div>
  );
}
