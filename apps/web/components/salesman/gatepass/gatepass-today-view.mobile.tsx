import type { GatepassStatus } from "~/hooks/use-gatepasses";

import { GatepassInfoBanner } from "./gatepass-info-banner";
import { GatepassItemRow } from "./gatepass-item-row";
import {
  isHandedOver,
  type GatepassLine,
  type GatepassQuantityTotals,
} from "~/lib/gatepass-quantities";
import { GatepassTodayHeaderCard } from "./gatepass-today-header-card";

interface GatepassTodayViewMobileProps {
  businessDate: string;
  status: GatepassStatus;
  hasDiscrepancy: boolean;
  lines: GatepassLine[];
  totals: GatepassQuantityTotals;
}

export function GatepassTodayViewMobile({
  businessDate,
  status,
  hasDiscrepancy,
  lines,
  totals,
}: GatepassTodayViewMobileProps) {
  return (
    <div className="flex flex-col gap-4">
      <GatepassTodayHeaderCard
        businessDate={businessDate}
        status={status}
        hasDiscrepancy={hasDiscrepancy}
        totals={totals}
      />

      <div className="flex flex-col gap-2">
        {lines.map((line) => (
          <GatepassItemRow key={line.id} line={line} handedOver={isHandedOver(status)} />
        ))}
      </div>

      <GatepassInfoBanner />
    </div>
  );
}
