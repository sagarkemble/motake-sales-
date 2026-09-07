"use client";

import { useState } from "react";
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
import { Textarea } from "~/components/ui/textarea";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";

interface VerificationTabProps {
  salesmanId: string;
}

export function VerificationTab({ salesmanId }: VerificationTabProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { canonicalBusinessDate: businessDate, isCanonicalDateLoading } = useGatepasses();
  const {
    gatepasses,
    allotmentMatrix,
    isGatepassesLoading,
    isAllotmentMatrixLoading,
    verifyGatepassAsync,
    isVerifyingGatepass,
    flagGatepassDiscrepancyAsync,
    isFlaggingGatepass,
  } = useGatepasses({ businessDate: businessDate || undefined, includeAdminOverview: true });

  const [isFlagOpen, setIsFlagOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  if (isCanonicalDateLoading || isGatepassesLoading || isAllotmentMatrixLoading || !businessDate) {
    return (
      <div className="rounded-2xl border bg-card p-2">
        <TableRowsSkeleton rows={4} columns={6} />
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

  const expectedFor = (item: (typeof pendingItems)[number]) =>
    item.availableQty ?? item.issuedQty - item.soldQty;

  const totals = pendingItems.reduce(
    (accumulator, item) => {
      const expected = expectedFor(item);
      const short = Math.max(expected - item.returnedQty, 0);
      return {
        expected: accumulator.expected + expected,
        returned: accumulator.returned + item.returnedQty,
        short: accumulator.short + short,
      };
    },
    { expected: 0, returned: 0, short: 0 },
  );

  const submittedAt = pendingGatepass.handoverSubmittedAt
    ? formatDate(new Date(pendingGatepass.handoverSubmittedAt), "d MMM, p")
    : null;

  async function handleApproveAndClose() {
    if (!pendingGatepass) return;
    try {
      await verifyGatepassAsync({ id: pendingGatepass.id });
      toast.success(tx("Gate pass approved and closed"));
    } catch (verifyError) {
      const errorMessage =
        verifyError instanceof Error ? verifyError.message : tx("Could not close gate pass");
      toast.error(errorMessage);
    }
  }

  async function handleFlagDiscrepancy() {
    if (!pendingGatepass) return;
    const reason = flagReason.trim();
    if (!reason) return;
    try {
      await flagGatepassDiscrepancyAsync({ id: pendingGatepass.id, reason });
      toast.success(tx("Gate pass flagged as a discrepancy"));
      setIsFlagOpen(false);
      setFlagReason("");
    } catch (flagError) {
      const errorMessage =
        flagError instanceof Error ? flagError.message : tx("Could not flag gate pass");
      toast.error(errorMessage);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border bg-amber-500/5 p-4">
        <div>
          <p className="text-sm font-medium">Awaiting your approval</p>
          <p className="text-xs text-muted-foreground">
            {submittedAt ? `Submitted ${submittedAt}` : "Submitted for verification"}
          </p>
        </div>
        {totals.short > 0 ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/10 text-amber-600">
            {totals.short} short
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-brand/10 text-brand">
            Full return
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Expected back</p>
          <p className="text-xl font-semibold">{totals.expected}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Returned</p>
          <p className="text-xl font-semibold">{totals.returned}</p>
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <p className="text-xs text-muted-foreground">Short</p>
          <p className="text-xl font-semibold">{totals.short}</p>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Issued</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Expected</TableHead>
              <TableHead className="text-right">Returned</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pendingItems.map((item) => {
              const expected = expectedFor(item);
              const short = Math.max(expected - item.returnedQty, 0);
              return (
                <TableRow key={item.varietyId} className={short > 0 ? "bg-amber-500/5" : undefined}>
                  <TableCell>
                    <p className="text-sm font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">{item.varietyName}</p>
                  </TableCell>
                  <TableCell className="text-right">{item.issuedQty}</TableCell>
                  <TableCell className="text-right">{item.soldQty}</TableCell>
                  <TableCell className="text-right">{expected}</TableCell>
                  <TableCell className="text-right">{item.returnedQty}</TableCell>
                  <TableCell>
                    {short > 0 ? (
                      <div className="flex flex-col gap-0.5">
                        <Badge
                          variant="outline"
                          className="w-fit border-transparent bg-amber-500/10 text-amber-600 capitalize"
                        >
                          {item.shortReason ?? "unspecified"} · {short}
                        </Badge>
                        {item.shortNote && (
                          <span className="text-xs text-muted-foreground">{item.shortNote}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={isVerifyingGatepass || isFlaggingGatepass}
          onClick={() => setIsFlagOpen(true)}
          className="flex-1 rounded-full border-amber-500/50 text-amber-600 hover:bg-amber-500/10 hover:text-amber-600"
        >
          Flag as Discrepancy
        </Button>
        <Button
          type="button"
          disabled={isVerifyingGatepass || isFlaggingGatepass}
          onClick={handleApproveAndClose}
          className="flex-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isVerifyingGatepass ? "Please wait..." : "Approve & Close"}
        </Button>
      </div>

      <AlertDialog open={isFlagOpen} onOpenChange={setIsFlagOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Flag as discrepancy</AlertDialogTitle>
            <AlertDialogDescription>
              This closes the gate pass and marks it for follow-up with the salesman. Add a reason so
              it&apos;s clear what went wrong.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={flagReason}
            onChange={(event) => setFlagReason(event.target.value)}
            placeholder="e.g. Returned count doesn't match the reported shortfall…"
            className="resize-none rounded-xl text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isFlaggingGatepass}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isFlaggingGatepass || !flagReason.trim()}
              onClick={(event) => {
                event.preventDefault();
                void handleFlagDiscrepancy();
              }}
              className="bg-amber-600 hover:bg-amber-600/90"
            >
              {isFlaggingGatepass ? "Flagging..." : "Flag & Close"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
