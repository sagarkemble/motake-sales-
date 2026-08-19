"use client";

import { format, parseISO } from "date-fns";
import { InfoIcon } from "lucide-react";

import { GatepassStatusBadge } from "~/components/shared/gatepass-status-badge";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "~/components/ui/drawer";
import { Spinner } from "~/components/ui/spinner";
import { useGatepasses } from "~/hooks/use-gatepasses";

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
  const { myGatepass, isMyGatepassLoading } = useGatepasses({
    businessDate: businessDate ?? undefined,
    includeMyGatepass: Boolean(businessDate),
  });

  const totalIssuedQty = myGatepass?.items.reduce((sum, item) => sum + item.issuedQty, 0) ?? 0;
  const totalSoldQty = myGatepass?.items.reduce((sum, item) => sum + item.soldQty, 0) ?? 0;

  return (
    <Drawer open={Boolean(businessDate)} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>Gate Pass Details</DrawerTitle>
        </DrawerHeader>

        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-6">
          {isMyGatepassLoading || !myGatepass ? (
            <div className="flex justify-center py-10">
              <Spinner className="size-6 text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-4 rounded-2xl border bg-card p-4">
                <div className="flex items-center justify-between">
                  <p className="text-base font-semibold">
                    {format(parseISO(myGatepass.gatepass.businessDate), "d MMM yyyy")}
                  </p>
                  <GatepassStatusBadge status={myGatepass.gatepass.status} />
                </div>

                <div className="flex flex-col gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Issued At</p>
                    <p className="font-medium">
                      {format(new Date(myGatepass.gatepass.createdAt), "d MMM yyyy, hh:mm a")}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Issued By</p>
                    <p className="font-medium">{myGatepass.issuedByName ?? "Admin"}</p>
                  </div>
                  {myGatepass.closedByName && (
                    <div>
                      <p className="text-muted-foreground">Fulfilled By</p>
                      <p className="font-medium">{myGatepass.closedByName}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <p className="text-sm font-semibold">Items Allocated</p>

                <div className="flex flex-col divide-y rounded-2xl border bg-card">
                  <div className="grid grid-cols-5 gap-2 px-3 py-2 text-xs text-muted-foreground">
                    <p className="col-span-2">Item</p>
                    <p className="text-right">Allocated</p>
                    <p className="text-right">Sold</p>
                    <p className="text-right">Remaining</p>
                  </div>
                  {myGatepass.items.map((item) => {
                    const display = varietyDisplayById.get(item.varietyId);
                    const remainingQty = item.availableQty ?? item.issuedQty - item.soldQty;
                    return (
                      <div key={item.id} className="grid grid-cols-5 gap-2 px-3 py-3 text-sm">
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
                        <p className="text-right font-medium">{remainingQty}</p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Total Items</p>
                  <p className="text-xl font-semibold">{totalIssuedQty}</p>
                </div>
                <div className="rounded-2xl border bg-card p-4">
                  <p className="text-xs text-muted-foreground">Total Sold Items</p>
                  <p className="text-xl font-semibold">{totalSoldQty}</p>
                </div>
              </div>

              <div className="flex gap-2 rounded-2xl border border-brand/20 bg-brand/5 p-3 text-xs">
                <InfoIcon className="size-4 shrink-0 text-brand" />
                <p className="text-foreground">
                  Sold items count includes only{" "}
                  <span className="font-medium">orders</span>. Pre-orders are not deducted.
                </p>
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
