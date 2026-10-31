"use client";

import { format } from "date-fns";
import { HistoryIcon, TicketXIcon } from "lucide-react";
import { useState } from "react";

import { GatepassDetailDrawer } from "~/components/salesman/gatepass-detail-drawer";
import { GatepassHistoryCard } from "~/components/salesman/gatepass-history-card";
import { sumGatepassQuantities, type GatepassLine } from "~/lib/gatepass-quantities";
import { HandoverDialog } from "~/components/salesman/gatepass/handover-dialog";
import { GatepassTodayViewDesktop } from "~/components/salesman/gatepass/gatepass-today-view.desktop";
import { GatepassTodayViewMobile } from "~/components/salesman/gatepass/gatepass-today-view.mobile";
import { Button } from "~/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useProducts } from "~/hooks/use-products";
import { useTranslate } from "~/hooks/use-translate";
import { ListItemSkeleton } from "~/components/shared/list-item-skeleton";
import { usePageRefresh, usePageReloading } from "~/providers/page-refresh-provider";

const CATALOG_PAGE_SIZE = 200;

export default function SalesmanGatepassPage() {
  const tx = useTranslate();
  const businessDateKey = format(new Date(), "yyyy-MM-dd");
  const [detailBusinessDate, setDetailBusinessDate] = useState<string | null>(null);
  const [isHandoverDialogOpen, setIsHandoverDialogOpen] = useState(false);

  const {
    myGatepass,
    isMyGatepassLoading,
    refetchMyGatepass,
    isMyGatepassFetching,
    myHistory,
    isMyHistoryLoading,
    refetchMyHistory,
    isMyHistoryFetching,
  } = useGatepasses({
    businessDate: businessDateKey,
    includeMyGatepass: true,
    includeMyHistory: true,
  });
  const { productsPage, refetchProductsList, isProductsListFetching } = useProducts({
    listFilters: { page: 1, pageSize: CATALOG_PAGE_SIZE },
  });
  usePageRefresh(
    () => Promise.all([refetchMyGatepass(), refetchMyHistory(), refetchProductsList()]),
    isMyGatepassFetching || isMyHistoryFetching || isProductsListFetching,
  );
  const isReloading = usePageReloading();

  const varietyDisplayById = new Map(
    productsPage.items.flatMap(({ product, varieties }) =>
      varieties.map((variety) => [
        variety.id,
        { productName: product.name, varietyName: variety.displayName },
      ]),
    ),
  );

  const todayLines: GatepassLine[] = (myGatepass?.items ?? []).map((item) => {
    const display = varietyDisplayById.get(item.varietyId);
    return {
      id: item.id,
      productName: display?.productName ?? tx("salesman.gatepass.productFallback"),
      varietyName: display?.varietyName ?? "",
      issuedQty: item.issuedQty,
      soldQty: item.soldQty,
      sellableQty: item.sellableQty,
      returnedQty: item.returnedQty,
      shortReason: item.shortReason,
      shortNote: item.shortNote,
    };
  });
  const todayTotals = sumGatepassQuantities(todayLines);
  const isGatepassActive = myGatepass?.gatepass.status === "active";

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-4">
      <Tabs defaultValue="today">
        <TabsList className="w-full">
          <TabsTrigger value="today" className="flex-1">
            {tx("salesman.gatepass.tab.today")}
          </TabsTrigger>
          <TabsTrigger value="history" className="flex-1">
            {tx("salesman.gatepass.tab.history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="flex flex-col gap-4">
          <Button
            type="button"
            disabled={!isGatepassActive}
            onClick={() => setIsHandoverDialogOpen(true)}
            className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          >
            {!myGatepass || isGatepassActive
              ? tx("salesman.gatepass.handOverStock")
              : tx("salesman.gatepass.handedOver")}
          </Button>

          {isMyGatepassLoading || (isReloading && isMyGatepassFetching) ? (
            <ListItemSkeleton count={4} />
          ) : !myGatepass ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
              <TicketXIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{tx("salesman.gatepass.emptyToday")}</p>
            </div>
          ) : (
            <>
              <div className="md:hidden">
                <GatepassTodayViewMobile
                  routeName={myGatepass.gatepass.routeName}
                  routeCode={myGatepass.gatepass.routeCode}
                  businessDate={myGatepass.gatepass.businessDate}
                  status={myGatepass.gatepass.status}
                  hasDiscrepancy={myGatepass.gatepass.hasDiscrepancy}
                  lines={todayLines}
                  totals={todayTotals}
                />
              </div>
              <div className="hidden md:block">
                <GatepassTodayViewDesktop
                  routeName={myGatepass.gatepass.routeName}
                  routeCode={myGatepass.gatepass.routeCode}
                  businessDate={myGatepass.gatepass.businessDate}
                  status={myGatepass.gatepass.status}
                  hasDiscrepancy={myGatepass.gatepass.hasDiscrepancy}
                  lines={todayLines}
                  totals={todayTotals}
                />
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex flex-col gap-3">
          {isMyHistoryLoading || (isReloading && isMyHistoryFetching) ? (
            <ListItemSkeleton count={5} />
          ) : myHistory.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center">
              <HistoryIcon className="size-6 text-muted-foreground" />
              <p className="text-sm font-medium">{tx("salesman.gatepass.emptyHistory")}</p>
            </div>
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
          lines={todayLines}
        />
      )}
    </div>
  );
}
