"use client";

import { CheckIcon } from "lucide-react";

import { StatusBadge } from "~/components/admin/products/status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { Progress } from "~/components/ui/progress";
import type { RouteChoice } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface AllotRouteStepProps {
  routeChoices: RouteChoice[];
  isRouteChoicesLoading: boolean;
  pricedCountByRouteId: Map<string, number>;
  catalogVarietyCount: number;
  selectedRouteId: string;
  onSelectRoute: (routeId: string) => void;
}

/** Step 2: listed Routes only, with how much of the catalog each one prices. */
export function AllotRouteStep({
  routeChoices,
  isRouteChoicesLoading,
  pricedCountByRouteId,
  catalogVarietyCount,
  selectedRouteId,
  onSelectRoute,
}: AllotRouteStepProps) {
  const tx = useTranslate();

  if (isRouteChoicesLoading) {
    return (
      <div className="flex flex-col gap-3">
        <ListItemSkeleton count={2} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{tx("admin.gatepass.allot.routeHint")}</p>
      {routeChoices.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
          {tx("admin.routes.noChoices")}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {routeChoices.map((route) => {
            const pricedCount = Math.min(
              pricedCountByRouteId.get(route.id) ?? 0,
              catalogVarietyCount,
            );
            const isSelected = selectedRouteId === route.id;
            return (
              <button
                key={route.id}
                type="button"
                onClick={() => onSelectRoute(route.id)}
                className={cn(
                  "flex flex-col gap-2 rounded-2xl border bg-card p-4 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors",
                  isSelected ? "border-brand bg-accent" : "hover:bg-accent",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{route.name}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {route.code}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {route.status === "inactive" && <StatusBadge status="inactive" />}
                    {isSelected && <CheckIcon className="size-4 text-brand" />}
                  </div>
                </div>
                <Progress
                  value={catalogVarietyCount ? (pricedCount / catalogVarietyCount) * 100 : 0}
                  className="h-1.5 [&>[data-slot=progress-indicator]]:bg-brand"
                />
                <p className="text-xs font-medium">
                  {tx("admin.gatepass.allot.pricedOf", {
                    count: pricedCount,
                    total: catalogVarietyCount,
                  })}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
