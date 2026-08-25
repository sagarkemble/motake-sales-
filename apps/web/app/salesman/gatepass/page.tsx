"use client";

import { format } from "date-fns";
import { useState } from "react";

import { GatepassDetailDrawer } from "~/components/salesman/gatepass-detail-drawer";
import { GatepassHistoryCard } from "~/components/salesman/gatepass-history-card";
import { HandoverDialog } from "~/components/salesman/gatepass/handover-dialog";
import { GatepassTodayViewDesktop } from "~/components/salesman/gatepass/gatepass-today-view.desktop";
import { GatepassTodayViewMobile } from "~/components/salesman/gatepass/gatepass-today-view.mobile";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";
import { computeGatepassTotals } from "~/lib/gatepass-totals";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";

const CATALOG_PAGE_SIZE = 200;

export default function SalesmanGatepassPage() {
  const businessDateKey = format(new Date(), "yyyy-MM-dd");
  const [detailBusinessDate, setDetailBusinessDate] = useState<string | null>(null);
  const [isHandoverDialogOpen, setIsHandoverDialogOpen] = useState(false);

  const { myGatepass, isMyGatepassLoading, myHistory, isMyHistoryLoading } = useGatepasses({
    businessDate: businessDateKey,
    includeMyGatepass: true,
    includeMyHistory: true,
  });
  const { productsPage } = useProducts({
    listFilters: { page: 1, pageSize: CATALOG_PAGE_SIZE },
  });

  const varietyDisplayById = new Map(
    productsPage.items.flatMap(({ product, varieties }) =>
      varieties.map((variety) => [
        variety.id,
        { productName: product.name, varietyName: variety.name, unit: variety.unit },
      ]),
    ),
  );

  const todayItems = (myGatepass?.items ?? []).map((item) => {
    const display = varietyDisplayById.get(item.varietyId);
    const remainingQty = item.availableQty ?? item.issuedQty - item.soldQty;
    return {
      id: item.id,
      productName: display?.productName ?? "Product",
      varietyName: display?.varietyName ?? "",
      unit: display?.unit ?? "",
      issuedQty: item.issuedQty,
      soldQty: item.soldQty,
      remainingQty,
    };
  });
  const { totalAllocatedQty, totalSoldQty, totalRemainingQty } = computeGatepassTotals(
    todayItems.map((item) => ({
      issuedQty: item.issuedQty,
      soldQty: item.soldQty,
      availableQty: item.remainingQty,
    })),
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="today">
        <TabsList className="w-full">
          <TabsTrigger value="today" className="flex-1">
            Today
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            History
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="flex flex-col gap-4">
          <Button
            type="button"
            disabled={myGatepass?.gatepass.status !== "active"}
            onClick={() => setIsHandoverDialogOpen(true)}
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            Handover
          </Button>

          {isMyGatepassLoading ? (
            <ListItemSkeleton count={4} />
          ) : !myGatepass ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No gate pass has been given to you for today yet.
            </p>
          ) : (
            <>
              <div className="md:hidden">
                <GatepassTodayViewMobile
                  items={todayItems}
                  totalAllocatedQty={totalAllocatedQty}
                  totalSoldQty={totalSoldQty}
                  totalRemainingQty={totalRemainingQty}
                />
              </div>
              <div className="hidden md:block">
                <GatepassTodayViewDesktop
                  items={todayItems}
                  totalAllocatedQty={totalAllocatedQty}
                  totalSoldQty={totalSoldQty}
                  totalRemainingQty={totalRemainingQty}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-3">
          {isMyHistoryLoading ? (
            <ListItemSkeleton count={5} />
          ) : myHistory.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No past gate passes found.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {myHistory.map((historyRow) => (
                <GatepassHistoryCard
                  key={historyRow.gatepass.id}
                  historyRow={historyRow}
                  onViewDetails={setDetailBusinessDate}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <GatepassDetailDrawer
        businessDate={detailBusinessDate}
        onOpenChange={(open) => {
          if (!open) setDetailBusinessDate(null);
        }}
        varietyDisplayById={varietyDisplayById}
      />

      {myGatepass && (
        <HandoverDialog
          open={isHandoverDialogOpen}
          onOpenChange={setIsHandoverDialogOpen}
          gatepassId={myGatepass.gatepass.id}
          items={todayItems}
        />
      )}
    </div>
  );
}
