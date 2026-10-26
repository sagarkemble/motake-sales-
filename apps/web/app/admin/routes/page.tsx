"use client";

import { Suspense, useRef, useState } from "react";
import { PlusIcon, SearchIcon, XIcon } from "lucide-react";

import { NewRouteForm } from "~/components/admin/routes/new-route-form";
import { RouteDetail } from "~/components/admin/routes/route-detail";
import { StatusBadge } from "~/components/admin/products/status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { useListQueryState } from "~/hooks/shared/use-list-query-state";
import { useRoutes } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

function RoutesPageContent() {
  const tx = useTranslate();
  const { searchTerm, setSearchTerm, debouncedSearchTerm } = useListQueryState();
  const [includeHidden, setIncludeHidden] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const detailRef = useRef<HTMLElement>(null);

  const { routes, isRoutesListLoading } = useRoutes({
    listFilters: { search: debouncedSearchTerm || undefined, includeHidden },
  });

  const activeRouteId = selectedRouteId ?? routes[0]?.id ?? null;

  function selectRoute(routeId: string) {
    setSelectedRouteId(routeId);
    // Stacked on a phone: bring the Route form into view.
    requestAnimationFrame(() =>
      detailRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 lg:grid-cols-[20rem_minmax(0,1fr)] lg:items-start">
      <section className="flex min-w-0 flex-col gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder={tx("admin.routes.searchPlaceholder")}
              className="rounded-full bg-muted/40 pl-9 pr-9"
            />
            {searchTerm && (
              <button
                type="button"
                aria-label={tx("common.actions.clearSearch")}
                onClick={() => setSearchTerm("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <XIcon className="size-4" />
              </button>
            )}
          </div>
          <Button
            type="button"
            size="icon"
            aria-label={tx("admin.routes.newTitle")}
            onClick={() => setIsCreating(true)}
            className="size-9 shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            <PlusIcon />
          </Button>
        </div>

        <label className="flex cursor-pointer items-center justify-end gap-2 text-xs font-medium text-muted-foreground">
          <Checkbox
            checked={includeHidden}
            onCheckedChange={(checked) => setIncludeHidden(checked === true)}
            className="data-[state=checked]:border-brand data-[state=checked]:bg-brand"
          />
          {tx("admin.routes.showHidden")}
        </label>

        {isCreating && (
          <NewRouteForm
            onCancel={() => setIsCreating(false)}
            onCreated={(routeId) => {
              setIsCreating(false);
              selectRoute(routeId);
            }}
          />
        )}

        <div className="flex flex-col gap-2">
          {isRoutesListLoading ? (
            <ListItemSkeleton count={4} />
          ) : routes.length === 0 ? (
            <p className="rounded-2xl border bg-card px-3 py-8 text-center text-sm text-muted-foreground">
              {debouncedSearchTerm
                ? tx("admin.routes.noMatch", { term: debouncedSearchTerm })
                : tx("admin.routes.empty")}
            </p>
          ) : (
            routes.map((route) => (
              <button
                key={route.id}
                type="button"
                onClick={() => selectRoute(route.id)}
                className={cn(
                  "flex items-center gap-3 rounded-2xl border bg-card p-3 text-left transition-colors hover:bg-accent/50",
                  activeRouteId === route.id && "border-brand bg-accent/50",
                  route.hidden && "border-dashed",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{route.name}</p>
                  <p className="truncate font-mono text-[11px] text-muted-foreground">
                    {route.code}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {route.deliveryState} ·{" "}
                    {tx("admin.routes.pricedCount", { count: route.pricedVarietyCount })}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={route.status} />
                  {route.hidden && (
                    <Badge variant="outline" className="border-dashed text-muted-foreground">
                      {tx("admin.routes.hidden")}
                    </Badge>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      <section
        ref={detailRef}
        // Fits the screen under the navbar (and above the phone tab bar); the prices scroll inside.
        className="flex h-[calc(100dvh-9.5rem)] min-w-0 scroll-mt-20 flex-col overflow-hidden rounded-2xl border bg-card p-4 md:h-[calc(100dvh-7rem)] lg:sticky lg:top-[4.5rem]"
      >
        {activeRouteId ? (
          <RouteDetail routeId={activeRouteId} />
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {isRoutesListLoading ? tx("common.status.loading") : tx("admin.routes.selectHint")}
          </p>
        )}
      </section>
    </div>
  );
}

export default function AdminRoutesPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
          <ListItemSkeleton count={4} />
        </div>
      }
    >
      <RoutesPageContent />
    </Suspense>
  );
}
