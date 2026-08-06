"use client";

import { format } from "date-fns";
import { ChevronRightIcon } from "lucide-react";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import type { GatepassHistoryRow } from "~/hooks/use-gatepasses";

interface GatepassHistoryCardProps {
  historyRow: GatepassHistoryRow;
  onViewDetails: (businessDate: string) => void;
}

export function GatepassHistoryCard({ historyRow, onViewDetails }: GatepassHistoryCardProps) {
  const { gatepass, totalIssuedQty, totalSoldQty } = historyRow;

  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{format(new Date(gatepass.businessDate), "d MMM yyyy")}</p>
        <GatepassStatusBadge status={gatepass.status} />
      </div>

      <div className="grid grid-cols-3 gap-2 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Total Items</p>
          <p className="font-medium">{totalIssuedQty}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Issued Items</p>
          <p className="font-medium">{totalIssuedQty}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Sold Items</p>
          <p className="font-medium">{totalSoldQty}</p>
        </div>
      </div>

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
