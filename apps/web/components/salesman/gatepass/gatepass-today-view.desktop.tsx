"use client";

import { useTranslate } from "~/hooks/use-translate";

import { GatepassInfoBanner } from "./gatepass-info-banner";
import { GatepassQuickStats } from "./gatepass-quick-stats";
import { GatepassTodayHeaderCard } from "./gatepass-today-header-card";

interface TodayGatepassItem {
  id: string;
  productName: string;
  varietyName: string;
  unit: string;
  issuedQty: number;
  soldQty: number;
  remainingQty: number;
}

interface GatepassTodayViewDesktopProps {
  items: TodayGatepassItem[];
  totalAllocatedQty: number;
  totalSoldQty: number;
  totalRemainingQty: number;
}

export function GatepassTodayViewDesktop({
  items,
  totalAllocatedQty,
  totalSoldQty,
  totalRemainingQty,
}: GatepassTodayViewDesktopProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <GatepassTodayHeaderCard
        totalAllocatedQty={totalAllocatedQty}
        totalRemainingQty={totalRemainingQty}
      />

      <GatepassQuickStats
        totalAllocatedQty={totalAllocatedQty}
        totalSoldQty={totalSoldQty}
        totalRemainingQty={totalRemainingQty}
      />

      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        <div className="grid grid-cols-5 gap-2 px-4 py-2 text-xs text-muted-foreground">
          <p className="col-span-2">{tx("salesman.gatepass.col.item")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.allocated")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.sold")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.remaining")}</p>
        </div>
        {items.map((item) => (
          <div key={item.id} className="grid grid-cols-5 gap-2 px-4 py-3 text-sm">
            <div className="col-span-2 min-w-0">
              <p className="truncate font-medium">{item.productName}</p>
              <p className="truncate text-xs text-muted-foreground">
                {item.varietyName} ({item.unit})
              </p>
            </div>
            <p className="text-right font-medium">{item.issuedQty}</p>
            <p className="text-right font-medium">{item.soldQty}</p>
            <p className="text-right font-medium">{item.remainingQty}</p>
          </div>
        ))}
      </div>

      <GatepassInfoBanner />
    </div>
  );
}
