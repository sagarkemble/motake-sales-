"use client";

import { format, subDays } from "date-fns";
import {
  CalendarDaysIcon,
  ClockIcon,
  IndianRupeeIcon,
  PercentIcon,
  RotateCcwIcon,
  ShoppingBagIcon,
  TicketIcon,
} from "lucide-react";

import { KpiCard } from "~/components/admin/dashboard/kpi-card";
import { OrderHistoryPanel } from "~/components/admin/dashboard/order-history-panel";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { StatGridSkeleton } from "~/components/shared/stat-grid-skeleton";

interface SalesTabProps {
  salesmanId: string;
}

const HISTORY_DAYS = 30;

export function SalesTab({ salesmanId }: SalesTabProps) {
  const tx = useTranslate();
  const { formatPaiseCompact } = useFormatMoney();
  const today = new Date();
  const historyFilters = {
    id: salesmanId,
    from: format(subDays(today, HISTORY_DAYS - 1), "yyyy-MM-dd"),
    to: format(today, "yyyy-MM-dd"),
  };

  const { salesmanHistory, isSalesmanHistoryLoading } = useSalesmen({ historyFilters });

  if (isSalesmanHistoryLoading) {
    return <StatGridSkeleton count={7} />;
  }

  const totalAllotted = salesmanHistory.reduce((total, day) => total + day.allottedQty, 0);
  const totalSold = salesmanHistory.reduce((total, day) => total + day.soldQty, 0);
  const totalReturned = salesmanHistory.reduce((total, day) => total + day.returnedQty, 0);
  const totalPreOrdered = salesmanHistory.reduce((total, day) => total + day.preOrderedQty, 0);
  const totalSoldAmountPaise = salesmanHistory.reduce(
    (total, day) => total + day.soldAmountPaise,
    0,
  );
  const activeDayCount = salesmanHistory.filter(
    (day) => day.gatepassStatus !== null && day.gatepassStatus !== "not_issued",
  ).length;
  const sellThroughRate = totalAllotted > 0 ? Math.round((totalSold / totalAllotted) * 100) : 0;

  const kpiCards = [
    { label: "admin.salesmen.kpi.itemsSold", value: totalSold, icon: ShoppingBagIcon },
    {
      label: "admin.salesmen.kpi.salesValue",
      value: formatPaiseCompact(totalSoldAmountPaise),
      icon: IndianRupeeIcon,
    },
    { label: "admin.salesmen.kpi.itemsAllotted", value: totalAllotted, icon: TicketIcon },
    { label: "admin.salesmen.kpi.itemsReturned", value: totalReturned, icon: RotateCcwIcon },
    { label: "admin.salesmen.kpi.preOrders", value: totalPreOrdered, icon: ClockIcon },
    { label: "admin.salesmen.kpi.activeDays", value: activeDayCount, icon: CalendarDaysIcon },
    {
      label: "admin.salesmen.kpi.sellThroughRate",
      value: `${sellThroughRate}%`,
      icon: PercentIcon,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        {tx("admin.salesmen.lastDays", { count: HISTORY_DAYS })}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} label={card.label} value={card.value} icon={card.icon} />
        ))}
      </div>

      <OrderHistoryPanel salesmanId={salesmanId} heading={tx("admin.salesmen.salesHistory")} />
    </div>
  );
}
