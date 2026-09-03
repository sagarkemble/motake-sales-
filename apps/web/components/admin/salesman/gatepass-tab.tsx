"use client";

import Link from "next/link";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { StatGridSkeleton } from "~/components/shared/stat-grid-skeleton";
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";

interface GatepassTabProps {
  salesmanId: string;
  isSalesmanDeleted?: boolean;
}

export function GatepassTab({ salesmanId, isSalesmanDeleted = false }: GatepassTabProps) {
  const { canonicalBusinessDate: businessDate, isCanonicalDateLoading } = useGatepasses();
  const { gatepasses, allotmentMatrix, isGatepassesLoading, isAllotmentMatrixLoading } =
    useGatepasses({ businessDate: businessDate || undefined, includeAdminOverview: true });

  if (isCanonicalDateLoading || isGatepassesLoading || isAllotmentMatrixLoading || !businessDate) {
    return (
      <div className="flex flex-col gap-4">
        <StatGridSkeleton count={2} />
        <div className="rounded-2xl border bg-card p-2">
          <TableRowsSkeleton rows={4} columns={6} />
        </div>
      </div>
    );
  }

  // A salesman may hold several gatepasses on the same day (one at a time). Surface the active
  // one if present, otherwise the most recent (list is newest-first).
  const salesmanGatepasses = gatepasses.filter((gatepass) => gatepass.salesmanId === salesmanId);
  const activeGatepass = salesmanGatepasses.find((gatepass) => gatepass.status === "active");
  const todaysGatepass = activeGatepass ?? salesmanGatepasses[0];
  const hasActiveGatepass = Boolean(activeGatepass);
  const allocatedItems = allotmentMatrix.filter((row) => row.salesmanId === salesmanId);

  const isHandedOver =
    todaysGatepass?.status === "pending_verification" || todaysGatepass?.status === "closed";

  const itemsAllocated = allocatedItems.reduce((total, item) => total + item.issuedQty, 0);
  const itemsRemaining = allocatedItems.reduce(
    (total, item) => total + (item.availableQty ?? item.issuedQty - item.soldQty),
    0,
  );
  const itemsReturned = allocatedItems.reduce((total, item) => total + item.returnedQty, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Today's gate pass</p>
          <p className="text-xs text-muted-foreground">{businessDate}</p>
          {todaysGatepass && (
            <p className="mt-1 text-xs text-muted-foreground">
              {isHandedOver ? `Handed over · ${itemsReturned} items returned` : "Not handed over yet"}
            </p>
          )}
        </div>
        <Badge variant="outline" className="capitalize">
          {todaysGatepass ? todaysGatepass.status.replace("_", " ") : "not issued"}
        </Badge>
      </div>

      <Button
        asChild={!hasActiveGatepass && !isSalesmanDeleted}
        disabled={hasActiveGatepass || isSalesmanDeleted}
        variant="outline"
        className="w-full rounded-full"
      >
        {isSalesmanDeleted ? (
          "Salesman deleted"
        ) : hasActiveGatepass ? (
          "Already allotted today"
        ) : (
          <Link href={`/gatepass?salesmanId=${salesmanId}`}>
            {todaysGatepass ? "Allot again" : "Allot"}
          </Link>
        )}
      </Button>

      <div className={`grid gap-3 ${isHandedOver ? "grid-cols-3" : "grid-cols-2"}`}>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Items allocated</p>
          <p className="text-xl font-semibold">{itemsAllocated}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Remaining items</p>
          <p className="text-xl font-semibold">{itemsRemaining}</p>
        </div>
        {isHandedOver && (
          <div className="rounded-2xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Items returned</p>
            <p className="text-xl font-semibold">{itemsReturned}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-2">
        {allocatedItems.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No items allocated today</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Variety</TableHead>
                <TableHead className="text-right">Issued</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Available</TableHead>
                <TableHead className="text-right">Returned</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocatedItems.map((item, index) => (
                <TableRow key={`${item.varietyId}-${index}`}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.varietyName}</TableCell>
                  <TableCell className="text-right">{item.issuedQty}</TableCell>
                  <TableCell className="text-right">{item.soldQty}</TableCell>
                  <TableCell className="text-right">
                    {item.availableQty ?? item.issuedQty - item.soldQty}
                  </TableCell>
                  <TableCell className="text-right">{item.returnedQty}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: Only orders deduct from Gate Pass.
      </p>
    </div>
  );
}
