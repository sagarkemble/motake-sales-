"use client";

import { Badge } from "~/components/ui/badge";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface StatusBadgeProps {
  status: "active" | "inactive";
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const tx = useTranslate();
  const isActive = status === "active";
  const label = isActive ? "common.status.active" : "common.status.inactive";

  return (
    <Badge
      variant="outline"
      className={cn(
        "max-w-[7.5rem] truncate",
        isActive
          ? "border-transparent bg-brand/10 text-brand"
          : "border-transparent bg-muted text-muted-foreground",
        className,
      )}
      title={tx(label)}
    >
      {tx(label)}
    </Badge>
  );
}
