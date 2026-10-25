"use client";

import { parseISO } from "date-fns";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { useFormatDate } from "~/hooks/use-format-date";
import type { GatepassStatus } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";

import { GatepassStatGrid } from "./gatepass-stat-grid";
import type { GatepassQuantityTotals } from "~/lib/gatepass-quantities";

interface GatepassTodayHeaderCardProps {
  businessDate: string;
  status: GatepassStatus;
  hasDiscrepancy: boolean;
  totals: GatepassQuantityTotals;
}

export function GatepassTodayHeaderCard({
  businessDate,
  status,
  hasDiscrepancy,
  totals,
}: GatepassTodayHeaderCardProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{tx("salesman.gatepass.todayTitle")}</p>
        <GatepassStatusBadge status={status} hasDiscrepancy={hasDiscrepancy} />
      </div>
      <p className="text-xs text-muted-foreground">
        {formatDate(parseISO(businessDate), "d MMM yyyy")}
      </p>
      <GatepassStatGrid totals={totals} status={status} />
    </div>
  );
}
