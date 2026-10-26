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
  routeName: string;
  routeCode: string;
  businessDate: string;
  status: GatepassStatus;
  hasDiscrepancy: boolean;
  lines: GatepassLine[];
  totals: GatepassQuantityTotals;
}

export function GatepassTodayViewMobile({
  routeName,
  routeCode,
  businessDate,
  status,
  hasDiscrepancy,
  lines,
  totals,
}: GatepassTodayViewMobileProps) {
  return (
    <div className="flex flex-col gap-4">
      <GatepassTodayHeaderCard
        routeName={routeName}
        routeCode={routeCode}
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
