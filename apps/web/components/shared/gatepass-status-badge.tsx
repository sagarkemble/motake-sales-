"use client";

import { TriangleAlertIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import type { GatepassStatus } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface GatepassStatusBadgeProps {
  status: GatepassStatus;
  // A GatePass the Admin flagged at verify shows as Flagged instead of Completed.
  hasDiscrepancy?: boolean;
  className?: string;
}

const gatepassStatusLabels: Record<GatepassStatus, string> = {
  not_issued: "common.gatepassStatus.notIssued",
  active: "common.gatepassStatus.active",
  pending_verification: "common.gatepassStatus.pendingVerification",
  closed: "common.gatepassStatus.completed",
};

const gatepassStatusStyles: Record<GatepassStatus, string> = {
  not_issued: "border-transparent bg-muted text-muted-foreground",
  active: "border-transparent bg-blue-500/10 text-blue-600",
  pending_verification: "border-transparent bg-amber-500/10 text-amber-600",
  closed: "border-transparent bg-brand/10 text-brand",
};

export function GatepassStatusBadge({
  status,
  hasDiscrepancy = false,
  className,
}: GatepassStatusBadgeProps) {
  const tx = useTranslate();

  if (hasDiscrepancy) {
    return (
      <Badge
        variant="outline"
        className={cn("gap-1 border-destructive/40 text-destructive", className)}
      >
        <TriangleAlertIcon className="size-3" />
        {tx("common.gatepassStatus.flagged")}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className={cn("max-w-[8.5rem] truncate", gatepassStatusStyles[status], className)}
      title={tx(gatepassStatusLabels[status])}
    >
      {tx(gatepassStatusLabels[status])}
    </Badge>
  );
}
