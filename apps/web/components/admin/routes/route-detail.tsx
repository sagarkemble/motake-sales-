"use client";

import { useEffect, useMemo, useState } from "react";
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
import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Switch } from "~/components/ui/switch";
import { useRoutes, type RoutePriceFormRow } from "~/hooks/use-routes";
import { useTranslate } from "~/hooks/use-translate";
import { useVarietyTaxPeriods } from "~/hooks/use-variety-tax-periods";
import { getErrorMessage } from "~/lib/get-error-message";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";
import type { IndianStateName } from "@repo/trpc/client";

import { DeliveryStateSelect } from "./delivery-state-select";
import { RoutePriceRow } from "./route-price-row";

interface RouteDetailProps {
  routeId: string;
}

/** The selected Route: name and delivery state saved on leave, status, prices, Delete. */
export function RouteDetail({ routeId }: RouteDetailProps) {
  const tx = useTranslate();
  const {
    route,
    routePriceForm,
    isRouteLoading,
    refetchRoute,
    isRouteFetching,
    updateRouteAsync,
    setRouteStatusAsync,
    isSettingRouteStatus,
    hideRouteAsync,
    isHidingRoute,
  } = useRoutes({ routeId });
  const [nameText, setNameText] = useState("");
  // The picked state while it saves, so the select shows it and stays locked until the server answers.
  const [savingDeliveryState, setSavingDeliveryState] = useState<IndianStateName | null>(null);
  const [hideRefusal, setHideRefusal] = useState<string | null>(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const varietyIds = useMemo(
    () => routePriceForm.map((variety) => variety.varietyId),
    [routePriceForm],
  );
  const { currentTaxes, isCurrentTaxesLoading, refetchCurrentTaxes, isCurrentTaxesFetching } =
    useVarietyTaxPeriods({ varietyIds });
  usePageRefresh(
    () => Promise.all([refetchRoute(), varietyIds.length > 0 ? refetchCurrentTaxes() : null]),
    isRouteFetching || isCurrentTaxesFetching,
  );
  const isReloading = usePageReloading();

  useEffect(() => {
    setNameText(route?.name ?? "");
  }, [route?.name]);

  useEffect(() => {
    setHideRefusal(null);
  }, [routeId]);

  if (isRouteLoading || (isReloading && isRouteFetching)) {
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
      toast.error(getErrorMessage(tx, error, tx("admin.routes.updateFailed")));
    }
  }

  async function commitDeliveryState(deliveryState: IndianStateName) {
    if (!route || deliveryState === route.deliveryState) return;
    setSavingDeliveryState(deliveryState);
    try {
      await updateRouteAsync({ id: route.id, deliveryState });
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.routes.updateFailed")));
    } finally {
      setSavingDeliveryState(null);
    }
  }

  async function handleStatusChange(isActive: boolean) {
    if (!route) return;
    try {
      await setRouteStatusAsync({ id: route.id, status: isActive ? "active" : "inactive" });
    } catch (error) {
      toast.error(getErrorMessage(tx, error, tx("admin.routes.updateFailed")));
    }
  }

  async function handleHide() {
    if (!route) return;
    setHideRefusal(null);
    try {
      await hideRouteAsync({ id: route.id });
    } catch (error) {
      setHideRefusal(getErrorMessage(tx, error, tx("admin.routes.deleteFailed")));
    } finally {
      setIsConfirmOpen(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <header className="flex shrink-0 flex-col gap-4">
        {isHidden && (
          <Badge
            variant="outline"
            className="w-fit border-transparent bg-destructive/10 text-destructive"
          >
            {tx("admin.routes.deleted")}
          </Badge>
        )}
        <div className="flex flex-col gap-1.5">
          {/* Phone: name + Delete at its own width, Delivery state below. Wider: name 40, state 40, Delete 20. */}
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
                className="h-11 rounded-xl bg-muted-soft text-base font-semibold"
              />
            </div>
            <div className="col-span-2 row-start-2 flex min-w-0 flex-col gap-1.5 sm:col-span-1 sm:row-start-1">
              <Label htmlFor={`route-state-${route.id}`}>{tx("admin.routes.deliveryState")}</Label>
              <DeliveryStateSelect
                id={`route-state-${route.id}`}
                value={savingDeliveryState ?? (route.deliveryState as IndianStateName)}
                disabled={savingDeliveryState != null}
                onValueChange={(deliveryState) => void commitDeliveryState(deliveryState)}
                className="data-[size=default]:h-11"
              />
              {savingDeliveryState ? (
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Spinner className="size-3" />
                  {tx("common.status.saving")}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tx("admin.routes.deliveryStateHint")}
                </p>
              )}
            </div>
            {/* A deleted Route cannot be brought back, so it has no button. */}
            {!isHidden && (
              // mt-5 lines the button up with the fields below their labels.
              <Button
                type="button"
                variant="outline"
                className="mt-5 h-auto min-h-11 max-w-36 rounded-full border-destructive px-4 leading-tight text-destructive hover:bg-destructive-soft hover:text-destructive sm:w-full sm:max-w-none sm:px-3"
                disabled={isHidingRoute}
                onClick={() => setIsConfirmOpen(true)}
              >
                <span className="truncate sm:whitespace-normal">
                  {tx("admin.routes.delete", { name: route.name })}
                </span>
              </Button>
            )}
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
          <div className="flex w-fit items-center gap-2 justify-self-end rounded-full bg-muted-soft px-3 py-2">
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

      <section className="flex min-h-0 flex-1 flex-col">
        <h2 className="text-sm font-medium">{tx("admin.routes.prices.title")}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{tx("admin.routes.prices.hint")}</p>
        {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
        <ScrollArea className="mt-1 min-h-0 flex-1 pr-3 [&_[data-slot=scroll-area-viewport]>div]:block!">
          {productGroups.length === 0 ? (
            <EmptyStateCard
              compact
              media="square"
              className="mt-3 bg-muted-faint"
              title={tx("empty.routePrices.title")}
              body={tx("empty.routePrices.body")}
              action={{ label: tx("empty.actions.addProduct"), href: "/admin/products/new" }}
            />
          ) : (
            productGroups.map((group) => (
              <div key={group.productName}>
                <h3 className="pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {group.productName}
                </h3>
                {group.varieties.map((variety) => (
                  <RoutePriceRow
                    key={variety.varietyId}
                    routeId={route.id}
                    variety={variety}
                    currentTax={
                      isCurrentTaxesLoading || (isReloading && isCurrentTaxesFetching)
                        ? undefined
                        : (currentTaxes.find((tax) => tax.varietyId === variety.varietyId)
                            ?.period ?? null)
                    }
                  />
                ))}
              </div>
            ))
          )}
        </ScrollArea>
      </section>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("admin.routes.deleteTitle", { name: route.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>{tx("admin.routes.deleteBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isHidingRoute}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isHidingRoute}
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={(event) => {
                event.preventDefault();
                void handleHide();
              }}
            >
              {tx("admin.routes.deleteConfirm")}
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
