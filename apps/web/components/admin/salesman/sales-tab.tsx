"use client";

import { format, subDays } from "date-fns";

import { OrderHistoryPanel } from "~/components/admin/dashboard/order-history-panel";
import { formatInrCompact } from "~/lib/format-money";
import { useSalesmen } from "~/hooks/use-salesmen";
import { useTranslate } from "~/hooks/use-translate";
import { StatGridSkeleton } from "~/components/shared/stat-grid-skeleton";

interface SalesTabProps {
  salesmanId: string;
}

const HISTORY_DAYS = 30;

export function SalesTab({ salesmanId }: SalesTabProps) {
  const tx = useTranslate();
  const today = new Date();
  const historyFilters = {
    id: salesmanId,
    from: format(subDays(today, HISTORY_DAYS - 1), "yyyy-MM-dd"),
    to: format(today, "yyyy-MM-dd"),
  };

  const { salesmanHistory, isSalesmanHistoryLoading } = useSalesmen({ historyFilters });

  if (isSalesmanHistoryLoading) {
    return <StatGridSkeleton count={8} />;
  }

  const totalAllotted = salesmanHistory.reduce((total, day) => total + day.allottedQty, 0);
  const totalSold = salesmanHistory.reduce((total, day) => total + day.soldQty, 0);
  const totalReturned = salesmanHistory.reduce((total, day) => total + day.returnedQty, 0);
  const totalPreOrdered = salesmanHistory.reduce((total, day) => total + day.preOrderedQty, 0);
  const totalSoldAmount = salesmanHistory.reduce((total, day) => total + day.soldAmount, 0);
  const totalPreOrderedAmount = salesmanHistory.reduce(
    (total, day) => total + day.preOrderedAmount,
    0,
  );
  const activeDayCount = salesmanHistory.filter(
    (day) => day.gatepassStatus !== null && day.gatepassStatus !== "not_issued",
  ).length;
  const sellThroughRate = totalAllotted > 0 ? Math.round((totalSold / totalAllotted) * 100) : 0;

  const kpiCards = [
    { label: "Items sold", value: totalSold },
    { label: "Sales value", value: formatInrCompact(totalSoldAmount) },
    { label: "Items allotted", value: totalAllotted },
    { label: "Items returned", value: totalReturned },
    { label: "Pre-orders", value: totalPreOrdered },
    { label: "Pre-order value", value: formatInrCompact(totalPreOrderedAmount) },
    { label: "Active days", value: activeDayCount },
    { label: "Sell-through rate", value: `${sellThroughRate}%` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">Last {HISTORY_DAYS} days</p>

      <div className="grid grid-cols-2 gap-3">
        {kpiCards.map((card) => (
          <div key={card.label} className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{tx(card.label)}</p>
            <p className="text-xl font-semibold">{card.value}</p>
          </div>
        ))}
      </div>

      <OrderHistoryPanel salesmanId={salesmanId} heading="Sales history" />
    </div>
  );
}
