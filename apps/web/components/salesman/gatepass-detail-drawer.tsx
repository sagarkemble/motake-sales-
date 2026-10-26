"use client";

import { parseISO } from "date-fns";
import { InfoIcon, TriangleAlertIcon } from "lucide-react";

import {
  SHORT_REASON_LABEL_KEYS,
  isHandedOver,
  shortQtyOf,
  sumGatepassQuantities,
} from "~/lib/gatepass-quantities";
import { GatepassStatGrid } from "~/components/salesman/gatepass/gatepass-stat-grid";
import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { ScrollArea } from "~/components/ui/scroll-area";
import { CardDetailSkeleton } from "~/components/shared/card-detail-skeleton";
import { RouteTag } from "~/components/shared/route-tag";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

interface VarietyDisplay {
  productName: string;
  varietyName: string;
  unit: string;
}

interface GatepassDetailDrawerProps {
  businessDate: string | null;
  onOpenChange: (open: boolean) => void;
  varietyDisplayById: Map<string, VarietyDisplay>;
}

export function GatepassDetailDrawer({
  businessDate,
  onOpenChange,
  varietyDisplayById,
}: GatepassDetailDrawerProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { myGatepass, isMyGatepassLoading } = useGatepasses({
    businessDate: businessDate ?? undefined,
    includeMyGatepass: Boolean(businessDate),
  });

  const totals = sumGatepassQuantities(myGatepass?.items ?? []);
  const handedOver = isHandedOver(myGatepass?.gatepass.status);

  return (
    <Drawer open={Boolean(businessDate)} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Gate Pass Details</DrawerTitle>
        </DrawerHeader>

        {/* Radix lays the viewport content out as a table; block keeps the rows' truncation working. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 px-4 pb-6">
            {isMyGatepassLoading || !myGatepass ? (
              <CardDetailSkeleton />
            ) : (
              <>
                <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-base font-semibold">
                      {formatDate(parseISO(myGatepass.gatepass.businessDate), "d MMM yyyy")}
                    </p>
                    <GatepassStatusBadge
                      status={myGatepass.gatepass.status}
                      hasDiscrepancy={myGatepass.gatepass.hasDiscrepancy}
                    />
                  </div>

                  <RouteTag
                    name={myGatepass.gatepass.routeName}
                    code={myGatepass.gatepass.routeCode}
                    className="text-sm"
                  />

                  <div className="flex flex-col gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">{tx("salesman.gatepass.issuedAt")}</p>
                      <p className="font-medium">
                        {formatDate(new Date(myGatepass.gatepass.createdAt), "d MMM yyyy, hh:mm a")}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">{tx("salesman.gatepass.issuedBy")}</p>
                      <p className="font-medium">
                        {myGatepass.issuedByName ?? tx("salesman.gatepass.admin")}
                      </p>
                    </div>
                    {myGatepass.closedByName && (
                      <div>
                        <p className="text-muted-foreground">Fulfilled By</p>
                        <p className="font-medium">{myGatepass.closedByName}</p>
                      </div>
                    )}
                  </div>
                </div>

                {myGatepass.gatepass.hasDiscrepancy && (
                  <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/5 p-3 text-xs">
                    <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                    <div>
                      <p className="font-medium text-destructive">
                        {tx("salesman.gatepass.flaggedBy", {
                          name: myGatepass.closedByName ?? tx("salesman.gatepass.admin"),
                        })}
                      </p>
                      {myGatepass.gatepass.discrepancyReason && (
                        <p className="text-muted-foreground">
                          {myGatepass.gatepass.discrepancyReason}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl border bg-card p-4">
                  <GatepassStatGrid totals={totals} status={myGatepass.gatepass.status} />
                </div>

                <div className="flex flex-col gap-2">
                  <p className="text-sm font-semibold">Items Allocated</p>

                  <div className="flex flex-col divide-y rounded-2xl border bg-card">
                    <div className="grid grid-cols-6 gap-2 px-3 py-2 text-xs text-muted-foreground">
                      <p className="col-span-2">{tx("salesman.gatepass.col.item")}</p>
                      <p className="text-right">{tx("salesman.gatepass.col.issued")}</p>
                      <p className="text-right">{tx("salesman.gatepass.col.sold")}</p>
                      <p className="text-right">{tx("salesman.gatepass.col.left")}</p>
                      <p className="text-right">{tx("salesman.gatepass.col.returnedShort")}</p>
                    </div>
                    {myGatepass.items.map((item) => {
                      const display = varietyDisplayById.get(item.varietyId);
                      const short = handedOver ? shortQtyOf(item) : 0;
                      return (
                        <div
                          key={item.id}
                          className={cn("px-3 py-3 text-sm", short > 0 && "bg-amber-500/5")}
                        >
                          <div className="grid grid-cols-6 gap-2 tabular-nums">
                            <div className="col-span-2 min-w-0">
                              <p className="truncate font-medium">
                                {display?.productName ?? "Product"}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {display?.varietyName} ({display?.unit})
                              </p>
                            </div>
                            <p className="text-right font-medium">{item.issuedQty}</p>
                            <p className="text-right font-medium">{item.soldQty}</p>
                            <p className="text-right font-medium">{item.sellableQty}</p>
                            <p className="text-right font-medium">
                              {handedOver ? item.returnedQty : "—"}
                            </p>
                          </div>
                          {short > 0 && (
                            <p className="mt-1 text-xs text-amber-700">
                              {tx("salesman.gatepass.shortLine", {
                                count: short,
                                reason: item.shortReason
                                  ? tx(SHORT_REASON_LABEL_KEYS[item.shortReason])
                                  : "—",
                              })}
                              {item.shortNote ? ` · ${item.shortNote}` : ""}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex gap-2 rounded-2xl border border-brand/20 bg-brand/5 p-3 text-xs">
                  <InfoIcon className="size-4 shrink-0 text-brand" />
                  <p className="text-foreground">{tx("salesman.gatepass.hint.soldOrdersOnly")}</p>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DrawerContent>
    </Drawer>
  );
}
