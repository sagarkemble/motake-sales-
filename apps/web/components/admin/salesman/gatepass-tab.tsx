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

interface GatepassTabProps {
  salesmanId: string;
  isSalesmanDeleted?: boolean;
}

export function GatepassTab({ salesmanId, isSalesmanDeleted = false }: GatepassTabProps) {
  const { canonicalBusinessDate: businessDate, isCanonicalDateLoading } = useGatepasses();
  const { gatepasses, allotmentMatrix, isGatepassesLoading, isAllotmentMatrixLoading } =
    useGatepasses({ businessDate: businessDate || undefined, includeAdminOverview: true });

  if (isCanonicalDateLoading || isGatepassesLoading || isAllotmentMatrixLoading || !businessDate) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Loading</p>;
  }

  const todaysGatepass = gatepasses.find((gatepass) => gatepass.salesmanId === salesmanId);
  const allocatedItems = allotmentMatrix.filter((row) => row.salesmanId === salesmanId);

  const itemsAllocated = allocatedItems.reduce((total, item) => total + item.issuedQty, 0);
  const itemsRemaining = allocatedItems.reduce(
    (total, item) => total + (item.availableQty ?? item.issuedQty - item.soldQty),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border bg-card p-4">
        <div>
          <p className="text-sm font-medium">Today's gate pass</p>
          <p className="text-xs text-muted-foreground">{businessDate}</p>
        </div>
        <Badge variant="outline" className="capitalize">
          {todaysGatepass ? todaysGatepass.status.replace("_", " ") : "not issued"}
        </Badge>
      </div>

      <Button
        asChild={!todaysGatepass && !isSalesmanDeleted}
        disabled={Boolean(todaysGatepass) || isSalesmanDeleted}
        variant="outline"
        className="w-full rounded-full"
      >
        {isSalesmanDeleted ? (
          "Salesman deleted"
        ) : todaysGatepass ? (
          "Already allotted today"
        ) : (
          <Link href={`/gatepass?salesmanId=${salesmanId}`}>Allot</Link>
        )}
      </Button>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Items allocated</p>
          <p className="text-xl font-semibold">{itemsAllocated}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Remaining items</p>
          <p className="text-xl font-semibold">{itemsRemaining}</p>
        </div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocatedItems.map((item) => (
                <TableRow key={item.varietyId}>
                  <TableCell>{item.productName}</TableCell>
                  <TableCell>{item.varietyName}</TableCell>
                  <TableCell className="text-right">{item.issuedQty}</TableCell>
                  <TableCell className="text-right">{item.soldQty}</TableCell>
                  <TableCell className="text-right">
                    {item.availableQty ?? item.issuedQty - item.soldQty}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Note: Only Book Now orders deduct from Gate Pass.
      </p>
    </div>
  );
}
