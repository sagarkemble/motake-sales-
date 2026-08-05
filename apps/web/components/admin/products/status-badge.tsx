import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

interface StatusBadgeProps {
  status: "active" | "inactive";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const isActive = status === "active";
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize",
        isActive
          ? "border-transparent bg-brand/10 text-brand"
          : "border-transparent bg-muted text-muted-foreground",
        className,
      )}
    >
      {status}
    </Badge>
  );
}
