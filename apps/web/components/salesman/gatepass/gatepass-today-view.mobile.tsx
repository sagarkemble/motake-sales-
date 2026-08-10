import { GatepassInfoBanner } from "./gatepass-info-banner";
import { GatepassItemRow } from "./gatepass-item-row";
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

interface GatepassTodayViewMobileProps {
  items: TodayGatepassItem[];
  totalAllocatedQty: number;
  totalSoldQty: number;
  totalRemainingQty: number;
}

export function GatepassTodayViewMobile({
  items,
  totalAllocatedQty,
  totalSoldQty,
  totalRemainingQty,
}: GatepassTodayViewMobileProps) {
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

      <div className="flex flex-col gap-2">
        {items.map((item) => (
          <GatepassItemRow
            key={item.id}
            productName={item.productName}
            varietyName={item.varietyName}
            unit={item.unit}
            issuedQty={item.issuedQty}
            soldQty={item.soldQty}
            remainingQty={item.remainingQty}
          />
        ))}
      </div>

      <GatepassInfoBanner />
    </div>
  );
}
