"use client";

import { parseISO } from "date-fns";
import { ChevronRightIcon } from "lucide-react";

import { GatepassStatGrid } from "~/components/salesman/gatepass/gatepass-stat-grid";
import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { RouteTag } from "~/components/shared/route-tag";
import { Button } from "~/components/ui/button";
import { useFormatDate } from "~/hooks/use-format-date";
import type { GatepassHistoryRow } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";

interface GatepassHistoryCardProps {
  historyRow: GatepassHistoryRow;
  onViewDetails: (businessDate: string) => void;
}

export function GatepassHistoryCard({ historyRow, onViewDetails }: GatepassHistoryCardProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { gatepass, routeName, routeCode, totalIssuedQty, totalSoldQty, totalReturnedQty } =
    historyRow;
  // The history row carries totals only, not lines, so short is not known here.
  const totals = {
    issued: totalIssuedQty,
    sold: totalSoldQty,
    left: totalIssuedQty - totalSoldQty,
    returned: totalReturnedQty,
    short: 0,
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card shadow-sm p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {formatDate(parseISO(gatepass.businessDate), "d MMM yyyy")}
        </p>
        <GatepassStatusBadge status={gatepass.status} hasDiscrepancy={gatepass.hasDiscrepancy} />
      </div>
      <RouteTag name={routeName} code={routeCode} />

      <GatepassStatGrid totals={totals} status={gatepass.status} />

      <Button
        type="button"
        variant="link"
        onClick={() => onViewDetails(gatepass.businessDate)}
        className="h-auto w-fit gap-1 p-0 text-brand"
      >
        {tx("salesman.gatepass.viewDetails")}
        <ChevronRightIcon className="size-4" />
      </Button>
    </div>
  );
}
