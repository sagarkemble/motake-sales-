"use client";

import { parseISO } from "date-fns";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { RouteTag } from "~/components/shared/route-tag";
import { useFormatDate } from "~/hooks/use-format-date";
import type { GatepassStatus } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";

import { GatepassStatGrid } from "./gatepass-stat-grid";
import type { GatepassQuantityTotals } from "~/lib/gatepass-quantities";

interface GatepassTodayHeaderCardProps {
  routeName: string;
  routeCode: string;
  businessDate: string;
  status: GatepassStatus;
  hasDiscrepancy: boolean;
  totals: GatepassQuantityTotals;
}

export function GatepassTodayHeaderCard({
  routeName,
  routeCode,
  businessDate,
  status,
  hasDiscrepancy,
  totals,
}: GatepassTodayHeaderCardProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-base font-semibold">
          {tx("salesman.gatepass.todayTitle")} · {formatDate(parseISO(businessDate), "d MMM yyyy")}
        </p>
        <GatepassStatusBadge status={status} hasDiscrepancy={hasDiscrepancy} />
      </div>
      <RouteTag name={routeName} code={routeCode} className="text-sm" />
      <GatepassStatGrid totals={totals} status={status} />
    </div>
  );
}
