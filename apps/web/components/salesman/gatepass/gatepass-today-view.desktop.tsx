"use client";

import type { GatepassStatus } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

import { GatepassInfoBanner } from "./gatepass-info-banner";
import {
  isHandedOver,
  type GatepassLine,
  type GatepassQuantityTotals,
} from "~/lib/gatepass-quantities";
import { GatepassTodayHeaderCard } from "./gatepass-today-header-card";

interface GatepassTodayViewDesktopProps {
  routeName: string;
  routeCode: string;
  businessDate: string;
  status: GatepassStatus;
  hasDiscrepancy: boolean;
  lines: GatepassLine[];
  totals: GatepassQuantityTotals;
}

export function GatepassTodayViewDesktop({
  routeName,
  routeCode,
  businessDate,
  status,
  hasDiscrepancy,
  lines,
  totals,
}: GatepassTodayViewDesktopProps) {
  const tx = useTranslate();
  const handedOver = isHandedOver(status);

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

      <div className="flex flex-col divide-y rounded-2xl border bg-card">
        <div className="grid grid-cols-6 gap-2 px-4 py-2 text-xs text-muted-foreground">
          <p className="col-span-2">{tx("salesman.gatepass.col.item")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.issued")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.sold")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.left")}</p>
          <p className="text-right">{tx("salesman.gatepass.col.returned")}</p>
        </div>
        {lines.map((line) => (
          <div key={line.id} className="grid grid-cols-6 gap-2 px-4 py-3 text-sm tabular-nums">
            <div className="col-span-2 min-w-0">
              <p className="truncate font-medium">{line.productName}</p>
              <p className="truncate text-xs text-muted-foreground">{line.varietyName}</p>
            </div>
            <p className="text-right font-medium">{line.issuedQty}</p>
            <p className="text-right font-medium">{line.soldQty}</p>
            <p
              className={cn(
                "text-right font-semibold text-brand",
                line.sellableQty === 0 && "text-muted-foreground",
              )}
            >
              {line.sellableQty}
            </p>
            <p className="text-right font-medium">{handedOver ? line.returnedQty : "—"}</p>
          </div>
        ))}
      </div>

      <GatepassInfoBanner />
    </div>
  );
}
