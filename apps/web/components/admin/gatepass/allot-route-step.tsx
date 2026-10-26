"use client";

import { CheckIcon } from "lucide-react";

import { Badge } from "~/components/ui/badge";
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
    return <p className="text-sm text-muted-foreground">{tx("common.status.loading")}</p>;
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
                  "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-colors",
                  isSelected ? "border-brand bg-brand/5 ring-1 ring-brand" : "hover:bg-muted/40",
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
                    {route.status === "inactive" && (
                      <Badge
                        variant="outline"
                        className="border-transparent bg-amber-500/10 text-amber-700"
                      >
                        {tx("common.status.inactive")}
                      </Badge>
                    )}
                    {isSelected && <CheckIcon className="size-4 text-brand" />}
                  </div>
                </div>
                <Progress
                  value={catalogVarietyCount ? (pricedCount / catalogVarietyCount) * 100 : 0}
                  className="h-1.5"
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
