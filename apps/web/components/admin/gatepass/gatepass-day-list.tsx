"use client";

import { useState } from "react";

import { GatepassLinesTable, GatepassQuantityKpis } from "~/components/admin/salesman/gatepass-tab";
import { SalesmanNameLink } from "~/components/admin/shared/name-links";
import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { RouteTag } from "~/components/shared/route-tag";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useFormatDate } from "~/hooks/use-format-date";
import type { AllotmentMatrixRow, DayGatepass } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { isHandedOver, sumGatepassQuantities } from "~/lib/gatepass-quantities";

import type { AllotSalesmanOption } from "./allot-salesman-step";
import { RouteFixedCard } from "./route-fixed-card";

interface GatepassDayListProps {
  businessDate: Date;
  salesmen: AllotSalesmanOption[];
  dayGatepasses: DayGatepass[];
  allotmentMatrix: AllotmentMatrixRow[];
  isLoading: boolean;
}

/** Every salesman's GatePasses on the chosen date, each with its Route. Tap one to open it. */
export function GatepassDayList({
  businessDate,
  salesmen,
  dayGatepasses,
  allotmentMatrix,
  isLoading,
}: GatepassDayListProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const [openGatepassId, setOpenGatepassId] = useState<string | null>(null);

  const formattedDate = formatDate(businessDate, "d MMM yyyy");
  const linesOf = (gatepassId: string) =>
    allotmentMatrix.filter((row) => row.gatepassId === gatepassId);
  const salesmanNameOf = (salesmanId: string) =>
    salesmen.find((salesman) => salesman.id === salesmanId)?.name ?? "";
  const openGatepass = dayGatepasses.find((gatepass) => gatepass.id === openGatepassId);

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-semibold">{tx("admin.gatepass.list.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {tx("admin.gatepass.list.hint", { date: formattedDate })}
        </p>
      </div>

      {isLoading ? (
        <ListItemSkeleton count={3} />
      ) : (
        salesmen.map((salesman) => {
          const salesmanGatepasses = dayGatepasses.filter(
            (gatepass) => gatepass.salesmanId === salesman.id,
          );
          return (
            <div key={salesman.id} className="flex flex-col gap-2 rounded-2xl border bg-card p-3">
              <p className="text-sm font-semibold">
                <SalesmanNameLink salesmanId={salesman.id}>{salesman.name}</SalesmanNameLink>
              </p>
              {salesmanGatepasses.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {tx("admin.gatepass.list.none", { date: formattedDate })}
                </p>
              ) : (
                salesmanGatepasses.map((gatepass) => {
                  const totals = sumGatepassQuantities(linesOf(gatepass.id));
                  return (
                    <button
                      key={gatepass.id}
                      type="button"
                      onClick={() => setOpenGatepassId(gatepass.id)}
                      className="flex w-full flex-col gap-1.5 rounded-2xl border bg-card p-3 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex w-full items-start justify-between gap-2">
                        <p className="text-xs text-muted-foreground">
                          {tx("admin.gatepass.list.issuedSold", {
                            time: formatDate(new Date(gatepass.createdAt), "p"),
                            issued: totals.issued,
                            sold: totals.sold,
                          })}
                        </p>
                        <GatepassStatusBadge
                          status={gatepass.status}
                          hasDiscrepancy={gatepass.hasDiscrepancy}
                        />
                      </div>
                      <RouteTag name={gatepass.routeName} code={gatepass.routeCode} />
                    </button>
                  );
                })
              )}
            </div>
          );
        })
      )}

      <Dialog
        open={Boolean(openGatepass)}
        onOpenChange={(isOpen) => !isOpen && setOpenGatepassId(null)}
      >
        <DialogContent className="flex max-h-[90dvh] flex-col gap-0 p-0 sm:max-w-2xl">
          {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
          <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
            <div className="flex flex-col gap-4 p-6">
              {openGatepass && (
                <div className="flex flex-col gap-4">
                  <DialogHeader className="text-left">
                    <DialogTitle className="flex flex-wrap items-center gap-2">
                      <SalesmanNameLink salesmanId={openGatepass.salesmanId}>
                        {salesmanNameOf(openGatepass.salesmanId)}
                      </SalesmanNameLink>
                      <GatepassStatusBadge
                        status={openGatepass.status}
                        hasDiscrepancy={openGatepass.hasDiscrepancy}
                      />
                    </DialogTitle>
                    <DialogDescription>
                      {tx("admin.gatepass.list.allottedAt", {
                        date: formattedDate,
                        time: formatDate(new Date(openGatepass.createdAt), "p"),
                      })}
                    </DialogDescription>
                  </DialogHeader>
                  <RouteFixedCard
                    routeName={openGatepass.routeName}
                    routeCode={openGatepass.routeCode}
                  />
                  <GatepassQuantityKpis
                    totals={sumGatepassQuantities(linesOf(openGatepass.id))}
                    handedOver={isHandedOver(openGatepass.status)}
                  />
                  <div className="rounded-2xl border bg-card p-2">
                    <GatepassLinesTable
                      rows={linesOf(openGatepass.id)}
                      handedOver={isHandedOver(openGatepass.status)}
                    />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </section>
  );
}
