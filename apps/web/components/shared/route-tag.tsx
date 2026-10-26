"use client";

import { MapPinIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface RouteTagProps {
  name: string;
  code: string;
  hidden?: boolean;
  inactive?: boolean;
  className?: string;
}

/** "Kolhapur · rt-kolhapur-001", labelled Hidden or Inactive when it is. */
export function RouteTag({
  name,
  code,
  hidden = false,
  inactive = false,
  className,
}: RouteTagProps) {
  const tx = useTranslate();

  return (
    <span
      className={cn(
        "inline-flex min-w-0 flex-wrap items-center gap-1 text-xs text-muted-foreground",
        className,
      )}
    >
      <MapPinIcon className="size-3 shrink-0" />
      <span className="min-w-0 truncate">
        <span className="font-medium text-foreground">{name}</span> ·{" "}
        <span className="font-mono text-[11px]">{code}</span>
      </span>
      {hidden && (
        <Badge
          variant="outline"
          className="h-4 rounded-full border-dashed px-1.5 text-[10px] text-muted-foreground"
        >
          {tx("admin.routes.deleted")}
        </Badge>
      )}
      {!hidden && inactive && (
        <Badge variant="secondary" className="h-4 rounded-full px-1.5 text-[10px]">
          {tx("common.status.inactive")}
        </Badge>
      )}
    </span>
  );
}
