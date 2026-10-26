"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Skeleton } from "~/components/ui/skeleton";
import { Switch } from "~/components/ui/switch";
import { useRoutes, type RoutePriceFormRow } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { getErrorMessage } from "~/lib/get-error-message";
import type { IndianStateName } from "@repo/trpc/client";

import { DeliveryStateSelect } from "./delivery-state-select";
import { RoutePriceRow } from "./route-price-row";

interface RouteDetailProps {
  routeId: string;
}

/** The selected Route: name and delivery state saved on leave, status, prices, Hide / Show again. */
export function RouteDetail({ routeId }: RouteDetailProps) {
  const tx = useTranslate();
  const {
    route,
    routePriceForm,
    isRouteLoading,
    updateRouteAsync,
    setRouteStatusAsync,
    isSettingRouteStatus,
    hideRouteAsync,
    isHidingRoute,
    showRouteAsync,
    isShowingRoute,
  } = useRoutes({ routeId });
  const [nameText, setNameText] = useState("");
  const [hideRefusal, setHideRefusal] = useState<string | null>(null);

  useEffect(() => {
    setNameText(route?.name ?? "");
  }, [route?.name]);

  useEffect(() => {
    setHideRefusal(null);
  }, [routeId]);

  if (isRouteLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-10 rounded-full" />
        <Skeleton className="h-10 rounded-full" />
        <Skeleton className="h-14 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (!route) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        {tx("admin.routes.notFound")}
      </p>
    );
  }

  const isHidden = route.deletedAt != null;
  const productGroups = groupByProduct(routePriceForm);

  async function commitName() {
    if (!route || nameText.trim() === route.name) return;
    try {
      await updateRouteAsync({ id: route.id, name: nameText });
    } catch (error) {
      setNameText(route.name);
      toast.error(getErrorMessage(error, tx("admin.routes.updateFailed")));
    }
  }

  async function commitDeliveryState(deliveryState: IndianStateName) {
    if (!route || deliveryState === route.deliveryState) return;
    try {
      await updateRouteAsync({ id: route.id, deliveryState });
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.updateFailed")));
    }
  }

  async function handleStatusChange(isActive: boolean) {
    if (!route) return;
    try {
      await setRouteStatusAsync({ id: route.id, status: isActive ? "active" : "inactive" });
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.updateFailed")));
    }
  }

  async function handleHide() {
    if (!route) return;
    setHideRefusal(null);
    try {
      await hideRouteAsync({ id: route.id });
    } catch (error) {
      setHideRefusal(getErrorMessage(error, tx("admin.routes.hideFailed")));
    }
  }

  async function handleShow() {
    if (!route) return;
    try {
      await showRouteAsync({ id: route.id });
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.showFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-4">
        {isHidden && (
          <Badge variant="outline" className="w-fit border-dashed text-muted-foreground">
            {tx("admin.routes.hidden")}
          </Badge>
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`route-name-${route.id}`}>{tx("admin.routes.name")}</Label>
          <Input
            id={`route-name-${route.id}`}
            value={nameText}
            maxLength={120}
            onChange={(event) => setNameText(event.target.value)}
            onBlur={() => void commitName()}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-11 rounded-xl bg-muted/40 text-base font-semibold"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`route-state-${route.id}`}>{tx("admin.routes.deliveryState")}</Label>
          <DeliveryStateSelect
            id={`route-state-${route.id}`}
            value={route.deliveryState as IndianStateName}
            onValueChange={(deliveryState) => void commitDeliveryState(deliveryState)}
          />
          <p className="text-xs text-muted-foreground">{tx("admin.routes.deliveryStateHint")}</p>
        </div>
        <div>
          <p className="text-sm font-medium">{tx("admin.routes.code")}</p>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{route.code}</p>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
          <div>
            <Label htmlFor={`route-status-${route.id}`}>
              {route.status === "active"
                ? tx("common.status.active")
                : tx("common.status.inactive")}
            </Label>
            <p className="text-xs text-muted-foreground">{tx("admin.routes.statusHint")}</p>
          </div>
          <Switch
            id={`route-status-${route.id}`}
            checked={route.status === "active"}
            disabled={isSettingRouteStatus}
            onCheckedChange={(checked) => void handleStatusChange(checked)}
          />
        </div>
      </header>

      <section>
        <h2 className="text-sm font-medium">{tx("admin.routes.prices.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tx("admin.routes.prices.hint")}</p>
        {productGroups.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {tx("admin.routes.prices.empty")}
          </p>
        ) : (
          productGroups.map((group) => (
            <div key={group.productName}>
              <h3 className="pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {group.productName}
              </h3>
              {group.varieties.map((variety) => (
                <RoutePriceRow key={variety.varietyId} routeId={route.id} variety={variety} />
              ))}
            </div>
          ))
        )}
      </section>

      <footer className="flex flex-col items-start gap-2 border-t pt-4">
        {isHidden ? (
          <Button
            type="button"
            variant="outline"
            className="rounded-full"
            disabled={isShowingRoute}
            onClick={() => void handleShow()}
          >
            {tx("admin.routes.showAgain", { name: route.name })}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              disabled={isHidingRoute}
              onClick={() => void handleHide()}
            >
              {tx("admin.routes.hide", { name: route.name })}
            </Button>
            {hideRefusal ? (
              <p role="alert" className="text-xs text-destructive">
                {hideRefusal}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">{tx("admin.routes.hideHint")}</p>
            )}
          </>
        )}
      </footer>
    </div>
  );
}

function groupByProduct(varieties: RoutePriceFormRow[]) {
  const groups = new Map<string, RoutePriceFormRow[]>();
  for (const variety of varieties) {
    const group = groups.get(variety.productName) ?? [];
    group.push(variety);
    groups.set(variety.productName, group);
  }
  return Array.from(groups, ([productName, groupVarieties]) => ({
    productName,
    varieties: groupVarieties,
  }));
}
