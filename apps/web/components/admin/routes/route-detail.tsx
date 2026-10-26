"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "~/components/ui/alert-dialog";
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
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

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
    } finally {
      setIsConfirmOpen(false);
    }
  }

  async function handleShow() {
    if (!route) return;
    try {
      await showRouteAsync({ id: route.id });
    } catch (error) {
      toast.error(getErrorMessage(error, tx("admin.routes.showFailed")));
    } finally {
      setIsConfirmOpen(false);
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
          {/* Phone: name + Hide at its own width, Delivery state below. Wider: name 40, state 40, Hide 20. */}
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:grid-cols-[2fr_2fr_1fr]">
            <div className="flex min-w-0 flex-col gap-1.5">
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
            <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:row-start-1">
              <Label htmlFor={`route-state-${route.id}`}>{tx("admin.routes.deliveryState")}</Label>
              <DeliveryStateSelect
                id={`route-state-${route.id}`}
                value={route.deliveryState as IndianStateName}
                onValueChange={(deliveryState) => void commitDeliveryState(deliveryState)}
                className="data-[size=default]:h-11"
              />
              <p className="text-xs text-muted-foreground">
                {tx("admin.routes.deliveryStateHint")}
              </p>
            </div>
            {/* mt-5 lines the button up with the fields below their labels. */}
            <Button
              type="button"
              variant="outline"
              className="mt-5 h-auto min-h-11 max-w-36 rounded-full px-4 leading-tight sm:w-full sm:max-w-none sm:px-3"
              disabled={isHidden ? isShowingRoute : isHidingRoute}
              onClick={() => setIsConfirmOpen(true)}
            >
              <span className="truncate sm:whitespace-normal">
                {isHidden
                  ? tx("admin.routes.showAgain", { name: route.name })
                  : tx("admin.routes.hide", { name: route.name })}
              </span>
            </Button>
          </div>
          {!isHidden && hideRefusal && (
            <p role="alert" className="text-right text-xs text-destructive">
              {hideRefusal}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 items-center gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{tx("admin.routes.code")}</p>
            <p className="mt-1 truncate font-mono text-sm text-muted-foreground">{route.code}</p>
          </div>
          <div className="flex w-fit items-center gap-2 justify-self-end rounded-full bg-muted/40 px-3 py-2">
            <Label htmlFor={`route-status-${route.id}`}>
              {route.status === "active"
                ? tx("common.status.active")
                : tx("common.status.inactive")}
            </Label>
            <Switch
              id={`route-status-${route.id}`}
              checked={route.status === "active"}
              disabled={isSettingRouteStatus}
              className="data-[state=checked]:bg-brand"
              onCheckedChange={(checked) => void handleStatusChange(checked)}
            />
          </div>
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

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isHidden
                ? tx("admin.routes.showTitle", { name: route.name })
                : tx("admin.routes.hideTitle", { name: route.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isHidden ? tx("admin.routes.showBody") : tx("admin.routes.hideBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isHidingRoute || isShowingRoute}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isHidingRoute || isShowingRoute}
              className="bg-brand text-brand-foreground hover:bg-brand/90"
              onClick={(event) => {
                event.preventDefault();
                void (isHidden ? handleShow() : handleHide());
              }}
            >
              {isHidden ? tx("admin.routes.showConfirm") : tx("admin.routes.hideConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
