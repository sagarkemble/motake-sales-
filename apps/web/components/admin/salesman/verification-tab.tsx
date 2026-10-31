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
import { getErrorMessage } from "~/lib/get-error-message";
import { sumGatepassQuantities } from "~/lib/gatepass-quantities";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { useFormatDate } from "~/hooks/use-format-date";
import { useGatepasses } from "~/hooks/use-gatepasses";
import { useTranslate } from "~/hooks/use-translate";
import { RouteTag } from "~/components/shared/route-tag";
import { TableRowsSkeleton } from "~/components/shared/table-rows-skeleton";

import { GatepassLinesTable, GatepassQuantityKpis } from "./gatepass-tab";

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
        <TableRowsSkeleton rows={4} columns={7} />
      </div>
    );
  }

  const pendingGatepass = gatepasses.find(
    (gatepass) => gatepass.salesmanId === salesmanId && gatepass.status === "pending_verification",
  );

  if (!pendingGatepass) {
    return (
      <p className="py-16 text-center text-sm text-muted-foreground">
        {tx("admin.salesmen.verify.nothingPending")}
      </p>
    );
  }

  const pendingItems = allotmentMatrix.filter((row) => row.gatepassId === pendingGatepass.id);

  const totals = sumGatepassQuantities(pendingItems);

  const submittedAt = pendingGatepass.handoverSubmittedAt
    ? formatDate(new Date(pendingGatepass.handoverSubmittedAt), "d MMM, p")
    : null;

  async function handleApproveAndClose() {
    if (!pendingGatepass) return;
    try {
      await verifyGatepassAsync({ id: pendingGatepass.id });
      toast.success(tx("admin.salesmen.verify.approved"));
    } catch (verifyError) {
      toast.error(getErrorMessage(tx, verifyError, tx("admin.salesmen.verify.closeFailed")));
    }
  }

  async function handleFlagDiscrepancy() {
    if (!pendingGatepass) return;
    const reason = flagReason.trim();
    if (!reason) return;
    try {
      await flagGatepassDiscrepancyAsync({ id: pendingGatepass.id, reason });
      toast.success(tx("admin.salesmen.verify.flagged"));
      setIsFlagOpen(false);
      setFlagReason("");
    } catch (flagError) {
      toast.error(getErrorMessage(tx, flagError, tx("admin.salesmen.verify.flagFailed")));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-2xl border bg-amber-500/5 p-4">
        <div>
          <p className="text-sm font-medium">{tx("admin.salesmen.verify.awaitingApproval")}</p>
          <p className="text-xs text-muted-foreground">
            {submittedAt
              ? tx("admin.salesmen.verify.submittedAt", { time: submittedAt })
              : tx("admin.salesmen.verify.submitted")}
          </p>
          <RouteTag
            name={pendingGatepass.routeName}
            code={pendingGatepass.routeCode}
            className="mt-1"
          />
        </div>
        {totals.short > 0 ? (
          <Badge variant="outline" className="border-transparent bg-amber-500/10 text-amber-600">
            {tx("admin.salesmen.verify.shortCount", { count: totals.short })}
          </Badge>
        ) : (
          <Badge variant="outline" className="border-transparent bg-brand/10 text-brand">
            {tx("admin.salesmen.verify.fullReturn")}
          </Badge>
        )}
      </div>

      <GatepassQuantityKpis totals={totals} handedOver />

      <div className="rounded-2xl border bg-card p-2">
        <GatepassLinesTable rows={pendingItems} handedOver />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          disabled={isVerifyingGatepass || isFlaggingGatepass}
          onClick={() => setIsFlagOpen(true)}
          className="flex-1 rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          {tx("admin.salesmen.verify.flagCta")}
        </Button>
        <Button
          type="button"
          disabled={isVerifyingGatepass || isFlaggingGatepass}
          onClick={handleApproveAndClose}
          className="flex-1 rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
        >
          {isVerifyingGatepass
            ? tx("common.status.pleaseWait")
            : tx("admin.salesmen.verify.approveCta")}
        </Button>
      </div>

      <AlertDialog open={isFlagOpen} onOpenChange={setIsFlagOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{tx("admin.salesmen.verify.flagTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{tx("admin.salesmen.verify.flagBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <Label htmlFor="flag-gatepass-reason">
            {tx("admin.salesmen.verify.flagReasonLabel")}
          </Label>
          <Textarea
            id="flag-gatepass-reason"
            rows={3}
            value={flagReason}
            onChange={(event) => setFlagReason(event.target.value)}
            placeholder={tx("admin.salesmen.verify.flagPlaceholder")}
            className="resize-none rounded-xl bg-muted-soft text-sm"
          />
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isFlaggingGatepass}>
              {tx("common.actions.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={isFlaggingGatepass || !flagReason.trim()}
              onClick={(event) => {
                event.preventDefault();
                void handleFlagDiscrepancy();
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isFlaggingGatepass
                ? tx("admin.salesmen.verify.flagging")
                : tx("admin.salesmen.verify.flagConfirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
