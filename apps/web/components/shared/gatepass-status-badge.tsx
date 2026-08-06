import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

type GatepassStatus = "not_issued" | "active" | "pending_verification" | "closed";

interface GatepassStatusBadgeProps {
  status: GatepassStatus;
  className?: string;
}

const gatepassStatusLabels: Record<GatepassStatus, string> = {
  not_issued: "Not Issued",
  active: "Active",
  pending_verification: "Pending Verification",
  closed: "Completed",
};

const gatepassStatusStyles: Record<GatepassStatus, string> = {
  not_issued: "border-transparent bg-muted text-muted-foreground",
  active: "border-transparent bg-blue-500/10 text-blue-600",
  pending_verification: "border-transparent bg-amber-500/10 text-amber-600",
  closed: "border-transparent bg-brand/10 text-brand",
};

export function GatepassStatusBadge({ status, className }: GatepassStatusBadgeProps) {
  return (
    <Badge variant="outline" className={cn(gatepassStatusStyles[status], className)}>
      {gatepassStatusLabels[status]}
    </Badge>
  );
}
