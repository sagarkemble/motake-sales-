"use client";

import { parseISO } from "date-fns";
import { ChevronRightIcon } from "lucide-react";

import { GatepassStatGrid } from "~/components/salesman/gatepass/gatepass-stat-grid";
import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { useFormatDate } from "~/hooks/use-format-date";
import type { GatepassHistoryRow } from "~/hooks/use-gatepasses";

interface GatepassHistoryCardProps {
  historyRow: GatepassHistoryRow;
  onViewDetails: (businessDate: string) => void;
}

export function GatepassHistoryCard({ historyRow, onViewDetails }: GatepassHistoryCardProps) {
  const formatDate = useFormatDate();
  const { gatepass, totalIssuedQty, totalSoldQty, totalReturnedQty } = historyRow;
  // The history row carries totals only, not lines, so short is not known here.
  const totals = {
    issued: totalIssuedQty,
    sold: totalSoldQty,
    left: totalIssuedQty - totalSoldQty,
    returned: totalReturnedQty,
    short: 0,
  };

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">
          {formatDate(parseISO(gatepass.businessDate), "d MMM yyyy")}
        </p>
        <GatepassStatusBadge status={gatepass.status} hasDiscrepancy={gatepass.hasDiscrepancy} />
      </div>

      <GatepassStatGrid totals={totals} status={gatepass.status} />

      <button
        type="button"
        onClick={() => onViewDetails(gatepass.businessDate)}
        className="flex w-fit items-center gap-1 text-sm font-medium text-brand"
      >
        View Details
        <ChevronRightIcon className="size-4" />
      </button>
    </div>
  );
}
