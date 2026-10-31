"use client";

import { endOfDay, format, startOfDay, subDays } from "date-fns";
import {
  CheckCircleIcon,
  ClockIcon,
  IndianRupeeIcon,
  RotateCcwIcon,
  ShoppingCartIcon,
  TicketIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { DiscrepancyPanel } from "~/components/admin/dashboard/discrepancy-panel";
import { KpiCard } from "~/components/admin/dashboard/kpi-card";
import { OrderHistoryPanel } from "~/components/admin/dashboard/order-history-panel";
import { adminQuickActions } from "~/components/admin/nav-items";
import { QuickActionLink } from "~/components/shared/quick-action-link";
import { Skeleton } from "~/components/ui/skeleton";
import { cn } from "~/lib/utils";
import { useAuth } from "~/hooks/use-auth";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useReports } from "~/hooks/use-reports";
import { useTranslate } from "~/hooks/use-translate";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

function KpiGridSkeleton({ count, columnClassName }: { count: number; columnClassName: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", columnClassName)}>
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

  const tx = useTranslate();
  const { signedInUser } = useAuth();
  const { formatPaiseCompact } = useFormatMoney();
  const {
    dailyKpiSummary: todayKpiSummary,
    isDailyKpiSummaryLoading: isTodayKpiSummaryLoading,
    refetchDailyKpiSummary: refetchTodayKpiSummary,
    isDailyKpiSummaryFetching: isTodayKpiSummaryFetching,
  } = useReports({ dailyKpiFilters: toBusinessDateFilters(today) });
  const {
    dailyKpiSummary: yesterdayKpiSummary,
    refetchDailyKpiSummary: refetchYesterdayKpiSummary,
    isDailyKpiSummaryFetching: isYesterdayKpiSummaryFetching,
  } = useReports({
    dailyKpiFilters: toBusinessDateFilters(yesterday),
  });
  usePageRefresh(
    () => Promise.all([refetchTodayKpiSummary(), refetchYesterdayKpiSummary()]),
    isTodayKpiSummaryFetching || isYesterdayKpiSummaryFetching,
  );
  const isReloading = usePageReloading();

  const trimmedSignedInUserName = signedInUser?.name?.trim();
  const firstName = trimmedSignedInUserName
    ? trimmedSignedInUserName.split(" ")[0]
    : tx("admin.dashboard.greetingFallbackName");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-4 sm:gap-8 sm:p-6">
      <section>
        <h1 className="text-xl font-semibold sm:text-2xl">
          {tx("admin.dashboard.greeting", { name: firstName ?? "" })}
        </h1>
        <p className="text-sm text-muted-foreground">{tx("admin.dashboard.subtitle")}</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {tx("admin.dashboard.todaysOrders")}
        </h2>
        {isTodayKpiSummaryLoading ||
        (isReloading && (isTodayKpiSummaryFetching || isYesterdayKpiSummaryFetching)) ? (
          <KpiGridSkeleton count={4} columnClassName="sm:grid-cols-4" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="admin.dashboard.kpi.orders"
              value={todayKpiSummary?.bookNowOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.bookNowOrderCount}
              icon={ShoppingCartIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.preOrders"
              value={todayKpiSummary?.preOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.preOrderCount}
              icon={ClockIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.fulfilled"
              value={todayKpiSummary?.fulfilledOrderCount ?? 0}
              previousValue={yesterdayKpiSummary?.fulfilledOrderCount}
              icon={CheckCircleIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.salesValue"
              value={formatPaiseCompact(todayKpiSummary?.salesValuePaise ?? 0)}
              numericValue={todayKpiSummary?.salesValuePaise ?? 0}
              previousValue={yesterdayKpiSummary?.salesValuePaise}
              icon={IndianRupeeIcon}
            />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {tx("admin.dashboard.todaysGatepasses")}
        </h2>
        {isTodayKpiSummaryLoading ||
        (isReloading && (isTodayKpiSummaryFetching || isYesterdayKpiSummaryFetching)) ? (
          <KpiGridSkeleton count={4} columnClassName="sm:grid-cols-4" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard
              label="admin.dashboard.kpi.issuedQty"
              value={todayKpiSummary?.gatepassTotals.totalIssuedQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalIssuedQty}
              icon={TicketIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.soldQty"
              value={todayKpiSummary?.gatepassTotals.totalSoldQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalSoldQty}
              icon={CheckCircleIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.returnedQty"
              value={todayKpiSummary?.gatepassTotals.totalReturnedQty ?? 0}
              previousValue={yesterdayKpiSummary?.gatepassTotals.totalReturnedQty}
              icon={RotateCcwIcon}
            />
            <KpiCard
              label="admin.dashboard.kpi.discrepancies"
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
        <DiscrepancyPanel businessDate={format(today, "yyyy-MM-dd")} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {tx("common.nav.quickActions")}
        </h2>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {adminQuickActions.map((quickAction) => (
            <QuickActionLink
              key={quickAction.href}
              href={quickAction.href}
              label={quickAction.label}
              icon={quickAction.icon}
            />
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          {tx("admin.dashboard.recentActivity")}
        </h2>
        <OrderHistoryPanel />
      </section>
    </div>
  );
}
