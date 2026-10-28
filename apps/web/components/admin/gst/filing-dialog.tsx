"use client";

import { AlertTriangleIcon, LockIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { RefusalAlert, ReasonField, businessToday } from "~/components/admin/ledger/ledger-shared";
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
import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { useAuth } from "~/hooks/use-auth";
import { useGst, type Gstr1Filing } from "~/hooks/use-gst";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage } from "~/lib/refusal";

import { useMonthLabel } from "./gst-lists";

const MAX_REFERENCE_LENGTH = 128;
const MAX_NOTES_LENGTH = 1000;

type FieldErrors = Partial<Record<"filedOn" | "reference" | "reason", string>>;

// The 12 months up to the current Asia/Kolkata month, newest first. Future months are not offered.
function monthOptions(): string[] {
  const [year, month] = businessToday().split("-").map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year!, month! - 1 - index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * Record GSTR-1 filing (with the preview/confirm step and the IRN pending warning) or Correct an
 * existing filing, in a modal dialog. The filer is always the signed-in Admin, never typed.
 */
export function FilingDialog({
  target,
  filings,
  onClose,
}: {
  // "new" records a filing; a filing Corrects it; null is closed.
  target: Gstr1Filing | "new" | null;
  filings: Gstr1Filing[];
  onClose: () => void;
}) {
  const tx = useTranslate();
  const monthLabel = useMonthLabel();
  const existing = target && target !== "new" ? target : undefined;
  return (
    <Dialog open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? tx("admin.gst.form.correctTitle", { month: monthLabel(existing.periodMonth) })
              : tx("admin.gst.form.recordTitle")}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? tx("admin.gst.form.correctDescription")
              : tx("admin.gst.form.recordDescription")}
          </DialogDescription>
        </DialogHeader>
        {target && (
          <FilingForm
            key={existing?.id ?? "new"}
            existing={existing}
            filings={filings}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function FilingForm({
  existing,
  filings,
  onClose,
}: {
  existing?: Gstr1Filing;
  filings: Gstr1Filing[];
  onClose: () => void;
}) {
  const tx = useTranslate();
  const monthLabel = useMonthLabel();
  const { signedInUser } = useAuth();
  const correcting = existing != null;
  const filedMonths = new Set(filings.map((filing) => filing.periodMonth.slice(0, 7)));
  const options = monthOptions();
  const [month, setMonth] = useState(
    existing?.periodMonth.slice(0, 7) ??
      options.find((option) => !filedMonths.has(option)) ??
      options[0]!,
  );
  const [filedOn, setFiledOn] = useState(existing?.filedOn ?? "");
  const [reference, setReference] = useState(existing?.reference ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [confirmMonth, setConfirmMonth] = useState<string | null>(null);
  const {
    filingPreview,
    isFilingPreviewLoading,
    filingPreviewError,
    recordFilingAsync,
    isRecordingFiling,
    correctFilingAsync,
    isCorrectingFiling,
  } = useGst({ previewMonth: confirmMonth });
  const isSaving = isRecordingFiling || isCorrectingFiling;

  function check(): boolean {
    const today = businessToday();
    const monthStart = `${month}-01`;
    const next: FieldErrors = {};
    if (!filedOn) next.filedOn = tx("admin.gst.form.errors.filedOnRequired");
    else if (filedOn < monthStart)
      next.filedOn = tx("admin.gst.form.errors.filedOnBeforeMonth", { month: monthLabel(month) });
    else if (filedOn > today) next.filedOn = tx("admin.gst.form.errors.filedOnFuture");
    if (!reference.trim()) next.reference = tx("admin.gst.form.errors.referenceRequired");
    if (correcting && !reason.trim()) next.reason = tx("admin.gst.form.errors.reasonRequired");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleRecord() {
    if (isSaving) return;
    setConfirmMonth(null);
    setRefusal(null);
    try {
      const result = await recordFilingAsync({
        month,
        filedOn,
        reference: reference.trim(),
        notes: notes.trim() || null,
      });
      const pending = result.data.irnPendingInMonth;
      toast.success(
        pending > 0
          ? tx("admin.gst.form.recordedIrnPending", { month: monthLabel(month), count: pending })
          : tx("admin.gst.form.recorded", { month: monthLabel(month) }),
      );
      onClose();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  async function handleCorrect() {
    if (!existing || isSaving) return;
    setRefusal(null);
    try {
      await correctFilingAsync({
        filingId: existing.id,
        filedOn,
        reference: reference.trim(),
        notes: notes.trim(),
        reason: reason.trim(),
      });
      toast.success(tx("admin.gst.form.corrected", { month: monthLabel(existing.periodMonth) }));
      onClose();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  const filerName = existing?.filerName ?? signedInUser?.name ?? "—";

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="gst-month">{tx("admin.gst.form.month")}</Label>
          {correcting ? (
            <Input id="gst-month" value={monthLabel(month)} disabled />
          ) : (
            <Select value={month} onValueChange={setMonth} disabled={isSaving}>
              <SelectTrigger id="gst-month" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option}>
                    {filedMonths.has(option)
                      ? tx("admin.gst.form.monthFiled", { month: monthLabel(option) })
                      : monthLabel(option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gst-filed-on">{tx("admin.gst.form.filedOn")}</Label>
          <Input
            id="gst-filed-on"
            type="date"
            min={`${month}-01`}
            max={businessToday()}
            value={filedOn}
            disabled={isSaving}
            aria-invalid={Boolean(errors.filedOn)}
            onChange={(event) => setFiledOn(event.target.value)}
          />
          <FieldError message={errors.filedOn} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="gst-reference">{tx("admin.gst.form.reference")}</Label>
          <Input
            id="gst-reference"
            value={reference}
            maxLength={MAX_REFERENCE_LENGTH}
            disabled={isSaving}
            placeholder={tx("admin.gst.form.referencePlaceholder")}
            aria-invalid={Boolean(errors.reference)}
            onChange={(event) => setReference(event.target.value)}
          />
          <FieldError message={errors.reference} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="gst-notes">{tx("admin.gst.form.notes")}</Label>
          <Textarea
            id="gst-notes"
            rows={2}
            value={notes}
            maxLength={MAX_NOTES_LENGTH}
            disabled={isSaving}
            placeholder={tx("admin.gst.form.notesPlaceholder")}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>{tx("admin.gst.form.filer")}</Label>
          <p className="text-sm text-muted-foreground">
            {correcting
              ? tx("admin.gst.form.filerOriginal", { name: filerName })
              : tx("admin.gst.form.filerYou", { name: filerName })}
          </p>
        </div>
        {correcting && (
          <div className="grid gap-1.5 sm:col-span-2">
            <ReasonField
              id="gst-reason"
              value={reason}
              onChange={setReason}
              disabled={isSaving}
              placeholder={tx("admin.gst.form.reasonPlaceholder")}
            />
            <FieldError message={errors.reason} />
          </div>
        )}
      </div>

      {correcting && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <LockIcon className="mt-0.5 size-3.5 shrink-0" />
          {tx("admin.gst.form.correctHint")}
        </p>
      )}

      {refusal && <RefusalAlert message={refusal} />}

      <DialogFooter>
        <Button variant="outline" disabled={isSaving} onClick={onClose}>
          {tx("admin.gst.form.close")}
        </Button>
        <Button
          disabled={isSaving}
          onClick={() => {
            if (!check()) return;
            if (correcting) void handleCorrect();
            else {
              setRefusal(null);
              setConfirmMonth(month);
            }
          }}
        >
          {isSaving && <Spinner />}
          {isSaving
            ? tx("admin.ledger.saving")
            : correcting
              ? tx("admin.gst.form.submitCorrect")
              : tx("admin.gst.form.submitRecord")}
        </Button>
      </DialogFooter>

      <AlertDialog
        open={confirmMonth != null}
        onOpenChange={(open) => !open && setConfirmMonth(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {tx("admin.gst.form.confirm.title", { month: monthLabel(month) })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                {isFilingPreviewLoading || (!filingPreview && !filingPreviewError) ? (
                  <p className="flex items-center gap-2">
                    <Spinner />
                    {tx("admin.gst.form.confirm.checking")}
                  </p>
                ) : filingPreviewError || !filingPreview ? (
                  <p className="text-destructive">
                    {refusalMessage(
                      tx,
                      filingPreviewError,
                      tx("admin.gst.form.confirm.previewFailed"),
                    )}
                  </p>
                ) : filingPreview.alreadyFiled ? (
                  <p className="text-destructive">
                    {tx("admin.gst.form.confirm.alreadyFiled", { month: monthLabel(month) })}
                  </p>
                ) : (
                  <>
                    <p>
                      {tx("admin.gst.form.confirm.bills", {
                        count: filingPreview.billsDatedInMonth,
                        month: monthLabel(month),
                      })}
                    </p>
                    {filingPreview.irnPendingInMonth > 0 ? (
                      <p className="flex items-start gap-2 rounded-md bg-amber-100 px-2 py-1.5 text-amber-900">
                        <AlertTriangleIcon className="mt-0.5 size-4 shrink-0" />
                        {tx("admin.gst.form.confirm.irnPending", {
                          count: filingPreview.irnPendingInMonth,
                        })}
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        {tx("admin.gst.form.confirm.noIrnPending")}
                      </p>
                    )}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx("admin.gst.form.confirm.back")}</AlertDialogCancel>
            <AlertDialogAction
              disabled={!filingPreview || filingPreview.alreadyFiled || isFilingPreviewLoading}
              onClick={(event) => {
                event.preventDefault();
                void handleRecord();
              }}
            >
              {tx("admin.gst.form.confirm.submit", { month: monthLabel(month) })}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
