"use client";

import { endOfDay, format, startOfDay, subDays } from "date-fns";
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
import { OrderHistoryPanel } from "~/components/admin/dashboard/order-history-panel";
import { QuickActionLink } from "~/components/admin/dashboard/quick-action-link";
import { Skeleton } from "~/components/ui/skeleton";
import { useAuth } from "~/hooks/use-auth";
import { useReports } from "~/hooks/use-reports";

function KpiGridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} className="h-24 rounded-2xl" />
      ))}
    </div>
  );
}

function toBusinessDateFilters(businessDate: Date) {
  return {
    businessDate: format(businessDate, "yyyy-MM-dd"),
    placedFrom: startOfDay(businessDate),
    placedTo: endOfDay(businessDate),
  };
}

export default function AdminDashboardPage() {
  const today = new Date();
  const yesterday = subDays(today, 1);

  const { signedInUser } = useAuth();
  const { dailyKpiSummary: todayKpiSummary, isDailyKpiSummaryLoading: isTodayKpiSummaryLoading } =
    useReports({ dailyKpiFilters: toBusinessDateFilters(today) });
  const { dailyKpiSummary: yesterdayKpiSummary } = useReports({
    dailyKpiFilters: toBusinessDateFilters(yesterday),
  });

  const firstName = signedInUser?.name?.split(" ")[0] ?? "Admin";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:gap-8 sm:p-6">
      <section>
        <h1 className="text-xl font-semibold sm:text-2xl">Hello, {firstName} 👋</h1>
        <p className="text-sm text-muted-foreground">
          Here is what is happening with your business today.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s orders</h2>
        {isTodayKpiSummaryLoading ? (
          <KpiGridSkeleton count={3} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard
              label="Book now"
              value={todayKpiSummary?.bookNowOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.bookNowOrderCount}
              icon={ShoppingCartIcon}
            />
            <KpiCard
              label="Pre-orders"
              value={todayKpiSummary?.preOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.preOrderCount}
              icon={ClockIcon}
            />
            <KpiCard
              label="Fulfilled"
              value={todayKpiSummary?.fulfilledOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.fulfilledOrderCount}
              icon={CheckCircleIcon}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Today&apos;s gate passes</h2>
        {isTodayKpiSummaryLoading ? (
          <KpiGridSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="Issued qty"
              value={todayKpiSummary?.gatepassTotals.totalIssuedQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalIssuedQty}
              icon={TicketIcon}
            />
            <KpiCard
              label="Sold qty"
              value={todayKpiSummary?.gatepassTotals.totalSoldQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalSoldQty}
              icon={CheckCircleIcon}
            />
            <KpiCard
              label="Returned qty"
              value={todayKpiSummary?.gatepassTotals.totalReturnedQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalReturnedQty}
              icon={RotateCcwIcon}
            />
            <KpiCard
              label="Discrepancies"
              value={todayKpiSummary?.gatepassTotals.discrepancyGatepassCount ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.discrepancyGatepassCount}
              icon={TriangleAlertIcon}
              className={
                (todayKpiSummary?.gatepassTotals.discrepancyGatepassCount ?? 0) > 0
                  ? "border-destructive/40 bg-destructive/5"
                  : undefined
              }
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Quick actions</h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          <QuickActionLink href="/gatepass" label="Allot Gate Passes" icon={TicketIcon} />
          <QuickActionLink href="/admin/products/new" label="Add Product" icon={PackagePlusIcon} />
          <QuickActionLink href="/admin/salesman/new" label="Add Salesman" icon={UserPlusIcon} />
          <QuickActionLink href="/admin/customers" label="View Customers" icon={StoreIcon} />
          <QuickActionLink href="/admin/orders" label="View Orders" icon={ShoppingCartIcon} />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Recent activity</h2>
        <OrderHistoryPanel />
      </section>
    </div>
  );
}
