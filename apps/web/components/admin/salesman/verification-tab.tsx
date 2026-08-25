"use client";

import { toast } from "sonner";

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
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";

interface VerificationTabProps {
  salesmanId: string;
}

export function VerificationTab({ salesmanId }: VerificationTabProps) {
  const { canonicalBusinessDate: businessDate, isCanonicalDateLoading } = useGatepasses();
  const {
    gatepasses,
    allotmentMatrix,
    isGatepassesLoading,
    isAllotmentMatrixLoading,
    verifyGatepassAsync,
    isVerifyingGatepass,
  } = useGatepasses({ businessDate: businessDate || undefined, includeAdminOverview: true });

  if (isCanonicalDateLoading || isGatepassesLoading || isAllotmentMatrixLoading || !businessDate) {
    return (
      <div className="rounded-2xl border bg-card p-2">
        <TableRowsSkeleton rows={4} columns={5} />
      </div>
    );
  }

  const pendingGatepass = gatepasses.find(
    (gatepass) => gatepass.salesmanId === salesmanId && gatepass.status === "pending_verification",
  );

  if (!pendingGatepass) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        Nothing pending verification.
      </p>
    );
  }

  const pendingItems = allotmentMatrix.filter((row) => row.salesmanId === salesmanId);

  async function handleVerifyAndClose() {
    if (!pendingGatepass) return;
    try {
      await verifyGatepassAsync({ id: pendingGatepass.id });
      toast.success("Gate pass verified and closed");
    } catch (verifyError) {
      const errorMessage =
        verifyError instanceof Error ? verifyError.message : "Could not close gate pass";
      toast.error(errorMessage);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border bg-card p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Variety</TableHead>
              <TableHead className="text-right">Issued</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Returned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingItems.map((item) => (
              <TableRow key={item.varietyId}>
                <TableCell>{item.productName}</TableCell>
                <TableCell>{item.varietyName}</TableCell>
                <TableCell className="text-right">{item.issuedQty}</TableCell>
                <TableCell className="text-right">{item.soldQty}</TableCell>
                <TableCell className="text-right">{item.returnedQty}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Button
        type="button"
        disabled={isVerifyingGatepass}
        onClick={handleVerifyAndClose}
        className="w-full rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
      >
        {isVerifyingGatepass ? "Please wait..." : "Verify & Close"}
      </Button>
    </div>
  );
}
