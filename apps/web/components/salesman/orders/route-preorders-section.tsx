"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { AlertTriangleIcon, LockIcon, TicketXIcon } from "lucide-react";
import { useState } from "react";

import {
  FulfilPreOrderDrawer,
  type FulfilTarget,
} from "~/components/salesman/orders/fulfil-pre-order-drawer";
import { EmptyStateCard } from "~/components/shared/empty-state-card";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useAuth } from "~/hooks/use-auth";
import { useFormatDate } from "~/hooks/use-format-date";
import { useOrders } from "~/hooks/use-orders";
import { useTranslate } from "~/hooks/use-translate";
import { checkoutRefusalOf } from "~/lib/checkout-refusal";
import { cn } from "~/lib/utils";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

type RoutePreorder = RouterOutputs["orders"]["listRoutePreorders"]["data"][number];

/**
 * Open Pre-orders on the Active GatePass Route from every salesman. Due shows today's first, then
 * overdue ones; Upcoming is read-only until its day.
 */
export function RoutePreordersSection() {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { signedInUser } = useAuth();
  const [fulfilTarget, setFulfilTarget] = useState<FulfilTarget | null>(null);
  const {
    duePreorders,
    isDuePreordersLoading,
    duePreordersError,
    refetchDuePreorders,
    isDuePreordersFetching,
  } = useOrders({ routePreorders: true });
  usePageRefresh(refetchDuePreorders, isDuePreordersFetching);
  const isReloading = usePageReloading();

  const noActiveGatepass = checkoutRefusalOf(duePreordersError)?.reason === "no_active_gatepass";
  const dueToday = duePreorders.filter((order) => order.dueState === "due");
  const overdue = duePreorders.filter((order) => order.dueState === "overdue");
  const upcoming = duePreorders.filter((order) => order.dueState === "upcoming");
  const dueRows = [...dueToday, ...overdue];

  function placedByLabel(order: RoutePreorder) {
    if (!order.placedBySalesmanId) return tx("salesman.orders.sheet.office");
    if (order.placedBySalesmanId === signedInUser?.id) return tx("salesman.orders.route.you");
    return order.placedByName ?? tx("salesman.orders.route.anotherSalesman");
  }

  function openFulfil(order: RoutePreorder) {
    setFulfilTarget({
      orderId: order.id,
      shopName: order.customerShopName,
      scheduledDate: order.scheduledDate,
      placedAt: new Date(order.placedAt),
      description: tx("salesman.orders.route.drawerDescription", {
        qty: order.totalQuantity,
        by: placedByLabel(order),
      }),
    });
  }

  function renderRow(order: RoutePreorder) {
    const isUpcoming = order.dueState === "upcoming";
    const isOverdue = order.dueState === "overdue";
    return (
      <div
        key={order.id}
        className={cn(
          "flex items-center gap-3 rounded-2xl border bg-card p-3",
          isOverdue && "border-destructive/40",
          isUpcoming && "bg-muted-faint",
        )}
      >
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium">{order.customerShopName}</p>
            {isOverdue && (
              <Badge
                variant="outline"
                className="border-transparent bg-destructive/10 text-destructive"
              >
                {tx("salesman.orders.route.overdue")}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {order.lines.map((line) => `${line.name} ×${line.quantity}`).join(", ")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {tx("salesman.orders.route.rowMeta", {
              date: formatDate(order.scheduledDate, "EEE, d MMM yyyy"),
              by: placedByLabel(order),
            })}
          </p>
        </div>
        {isUpcoming ? (
          <Badge variant="outline" className="shrink-0 gap-1 font-normal text-muted-foreground">
            <LockIcon className="size-3" />
            {formatDate(order.scheduledDate, "EEE, d MMM yyyy")}
          </Badge>
        ) : (
          <Button
            type="button"
            size="sm"
            className="shrink-0 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
            onClick={() => openFulfil(order)}
          >
            {tx("salesman.orders.route.fulfil")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      {overdue.length > 0 && (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertTriangleIcon />
          <AlertTitle className="line-clamp-none">
            {tx("salesman.orders.route.overdueAlert", { count: overdue.length })}
          </AlertTitle>
          <AlertDescription>
            {tx("salesman.orders.route.overdueHint", {
              date: formatDate(overdue[0]?.scheduledDate ?? "", "d MMM yyyy"),
            })}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-base font-semibold">{tx("salesman.orders.route.title")}</p>
        <p className="text-xs text-muted-foreground">{tx("salesman.orders.route.allSalesmen")}</p>
      </div>

      {isDuePreordersLoading || (isReloading && isDuePreordersFetching) ? (
        <ListItemSkeleton count={2} />
      ) : noActiveGatepass ? (
        <Alert className="border-amber-500/40 bg-amber-500/5">
          <TicketXIcon className="text-amber-700" />
          <AlertTitle>{tx("salesman.checkout.noActiveGatepass.title")}</AlertTitle>
          <AlertDescription>{tx("salesman.orders.route.noGatepass")}</AlertDescription>
        </Alert>
      ) : duePreordersError ? (
        <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
          <AlertTriangleIcon />
          <AlertTitle className="line-clamp-none">
            {tx("salesman.orders.route.loadFailed")}
          </AlertTitle>
          <AlertDescription>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-1 rounded-full"
              onClick={() => refetchDuePreorders()}
            >
              {tx("common.actions.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
      ) : (
        <Tabs defaultValue="due">
          <TabsList className="w-full">
            <TabsTrigger value="due" className="flex-1">
              {tx("salesman.orders.route.tabDue", { count: dueRows.length })}
            </TabsTrigger>
            <TabsTrigger value="upcoming" className="flex-1">
              {tx("salesman.orders.route.tabUpcoming", { count: upcoming.length })}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="due" className="flex flex-col gap-2 pt-1">
            {dueRows.length === 0 ? (
              <EmptyStateCard
                compact
                title={tx("empty.routeDue.title")}
                body={tx("empty.routeDue.body")}
              />
            ) : (
              dueRows.map(renderRow)
            )}
          </TabsContent>
          <TabsContent value="upcoming" className="flex flex-col gap-2 pt-1">
            {upcoming.length === 0 ? (
              <EmptyStateCard
                compact
                title={tx("empty.routeUpcoming.title")}
                body={tx("empty.routeUpcoming.body")}
              />
            ) : (
              <>
                <p className="px-1 text-[11px] text-muted-foreground">
                  {tx("salesman.orders.route.upcomingReadOnly")}
                </p>
                {upcoming.map(renderRow)}
              </>
            )}
          </TabsContent>
        </Tabs>
      )}

      {fulfilTarget && (
        <FulfilPreOrderDrawer
          key={fulfilTarget.orderId}
          target={fulfilTarget}
          onClose={() => setFulfilTarget(null)}
        />
      )}
    </section>
  );
}
