"use client";

import { FileJsonIcon, FileTextIcon, ImageIcon, LockIcon, UploadIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { DatePicker } from "~/components/shared/date-picker";
import { Badge } from "~/components/ui/badge";
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
import { ScrollArea } from "~/components/ui/scroll-area";
import { Skeleton } from "~/components/ui/skeleton";
import { Spinner } from "~/components/ui/spinner";
import { Textarea } from "~/components/ui/textarea";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useBillGst, useGstDocuments, type BillGstState } from "~/hooks/use-gst";
import type { BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { refusalMessage } from "~/lib/refusal";
import { base64ToBlob, fileToBase64, saveFile } from "~/lib/save-file";
import { cn } from "~/lib/utils";

import { offReason } from "./bill-paper-parts";
import { RefusalAlert, ReasonField, businessToday } from "./ledger-shared";

export type GstDialogKind = "enter_irn" | "correct_irn" | "portal_cancel";

const MAX_IMAGE_BYTES = 1024 * 1024;
const MAX_ACK_NUMBER_LENGTH = 64;
const IMAGE_TYPES = ["image/png", "image/jpeg"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];

// --- Read-only pieces.

function IrnStatusChip({ gst }: { gst: BillGstState }) {
  const tx = useTranslate();
  const tone =
    gst.irnStatus === "pending"
      ? "border-transparent bg-amber-500/10 text-amber-700"
      : gst.irnStatus === "portal_cancelled"
        ? "border-transparent bg-destructive/10 text-destructive"
        : gst.irnStatus === "not_needed"
          ? "border-transparent bg-muted text-muted-foreground"
          : "border-transparent bg-brand/10 text-brand";
  return (
    <Badge variant="outline" className={tone}>
      {tx(`admin.ledger.paper.gst.status.${gst.irnStatus}`)}
    </Badge>
  );
}

function FiledMonthBadge() {
  const tx = useTranslate();
  return (
    <Badge variant="outline" className="gap-1">
      <LockIcon className="size-3" />
      {tx("admin.ledger.paper.gst.filedMonth")}
    </Badge>
  );
}

function FiledMonthNote({ gst }: { gst: BillGstState }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { filings } = useBillGst({ loadFilings: gst.filedMonth, enabled: gst.filedMonth });
  if (!gst.filedMonth) return null;
  const month = formatDate(`${gst.month}-01`, "MMM yyyy");
  const filing = filings.find((row) => row.periodMonth.startsWith(gst.month));
  return (
    <p className="flex items-start gap-2 rounded-xl bg-muted px-2 py-1.5 text-xs">
      <LockIcon className="mt-0.5 size-3.5 shrink-0" />
      <span>
        <span className="font-medium">{tx("admin.ledger.paper.gst.filedMonth")}:</span>{" "}
        {filing
          ? tx("admin.ledger.paper.gst.filedMonthNote", {
              month,
              date: formatDate(filing.filedOn, "d MMM yyyy"),
              reference: filing.reference,
            })
          : tx("admin.ledger.paper.gst.filedMonthPlain", { month })}
      </span>
    </p>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("text-sm break-all", mono && "font-mono text-xs")}>{value}</dd>
    </div>
  );
}

/** The signed QR image through a 5-minute private link, fetched when the dialog opens. */
function SignedQrImageDialog({
  billId,
  open,
  onOpenChange,
}: {
  billId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const tx = useTranslate();
  const { fetchSignedQrImageLink } = useGstDocuments();
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setUrl(null);
    setFailed(null);
    fetchSignedQrImageLink(billId).then(
      (link) => !cancelled && setUrl(link.url),
      (error: unknown) =>
        !cancelled && setFailed(refusalMessage(tx, error, tx("admin.ledger.paper.gst.qrFailed"))),
    );
    return () => {
      cancelled = true;
    };
    // The link is fetched once per open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, billId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{tx("admin.ledger.paper.gst.viewQr")}</DialogTitle>
          <DialogDescription>{tx("admin.ledger.paper.gst.qrPrivate")}</DialogDescription>
        </DialogHeader>
        {failed ? (
          <RefusalAlert message={failed} title={tx("admin.ledger.paper.gst.qrFailed")} />
        ) : url ? (
          <>
            {/* A short-lived signed link to a private object; next/image would cache it. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={url}
              alt={tx("admin.ledger.paper.gst.viewQr")}
              className="mx-auto max-h-72 w-auto rounded-xl border object-contain"
            />
            <Button variant="outline" className="rounded-full" asChild>
              <a href={url} target="_blank" rel="noreferrer">
                {tx("admin.ledger.paper.gst.qrFullSize")}
              </a>
            </Button>
          </>
        ) : (
          <Skeleton className="mx-auto size-48" />
        )}
      </DialogContent>
    </Dialog>
  );
}

function GstDetails({ gst }: { gst: BillGstState }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const [qrOpen, setQrOpen] = useState(false);
  return (
    <div className="space-y-3">
      {gst.irnStatus === "pending" && (
        <p className="text-sm text-muted-foreground">{tx("admin.ledger.paper.gst.pendingBody")}</p>
      )}
      {gst.irnStatus === "not_needed" && (
        <p className="text-sm text-muted-foreground">
          {gst.refusalReasons.enterIrn ?? tx("admin.ledger.paper.gst.notNeeded")}
        </p>
      )}
      {gst.irn && (
        <dl className="grid gap-2">
          <Field label={tx("admin.ledger.paper.gst.fields.irn")} value={gst.irn.irn} mono />
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={tx("admin.ledger.paper.gst.fields.ackNumber")}
              value={gst.irn.ackNumber ?? "—"}
              mono
            />
            <Field
              label={tx("admin.ledger.paper.gst.fields.ackDate")}
              value={gst.irn.ackDate ? formatDate(gst.irn.ackDate, "d MMM yyyy") : "—"}
            />
          </div>
          <Field
            label={tx("admin.ledger.paper.gst.fields.signedQrText")}
            value={gst.irn.signedQrText ?? "—"}
            mono
          />
          <Field
            label={tx("admin.ledger.paper.gst.fields.recorded")}
            value={tx("admin.ledger.paper.gst.fields.recordedValue", {
              name: gst.irn.recordedByName ?? "—",
              when: gst.irn.recordedAt ? formatDate(gst.irn.recordedAt, "d MMM yyyy, h:mm a") : "—",
            })}
          />
          {gst.irn.hasSignedQrImage && (
            <Button
              size="sm"
              variant="link"
              className="h-auto w-fit p-0 text-brand"
              onClick={() => setQrOpen(true)}
            >
              <ImageIcon className="size-4" />
              {tx("admin.ledger.paper.gst.viewQr")}
            </Button>
          )}
        </dl>
      )}
      {gst.irn?.correctReason && (
        <p className="rounded-xl bg-amber-500/10 px-2 py-1.5 text-xs text-amber-700 dark:text-amber-400">
          {tx("admin.ledger.paper.gst.lastCorrect", { reason: gst.irn.correctReason })}
        </p>
      )}
      {gst.portalCancellation && (
        <dl className="grid gap-2 rounded-xl border p-2">
          <p className="text-xs font-medium">{tx("admin.ledger.paper.gst.portalCancelled")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Field
              label={tx("admin.ledger.paper.gst.fields.ackNumber")}
              value={gst.portalCancellation.ackNumber}
              mono
            />
            <Field
              label={tx("admin.ledger.paper.gst.fields.ackDate")}
              value={
                gst.portalCancellation.ackDate
                  ? formatDate(gst.portalCancellation.ackDate, "d MMM yyyy")
                  : "—"
              }
            />
          </div>
          {gst.portalCancellation.notes && (
            <Field
              label={tx("admin.ledger.paper.gst.fields.notes")}
              value={gst.portalCancellation.notes}
            />
          )}
        </dl>
      )}
      <FiledMonthNote gst={gst} />
      {gst.irn?.hasSignedQrImage && (
        <SignedQrImageDialog billId={gst.billId} open={qrOpen} onOpenChange={setQrOpen} />
      )}
    </div>
  );
}

/** Draft PDF and Portal JSON: only while IRN pending, drawn on demand, never stored. */
function DraftDownloads({ billId }: { billId: string }) {
  const tx = useTranslate();
  const { fetchDraftPdf, fetchPortalJsonDraft } = useGstDocuments();
  const [busy, setBusy] = useState<"pdf" | "json" | null>(null);

  async function handleDownload(kind: "pdf" | "json") {
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const draft = await fetchDraftPdf(billId);
        saveFile(draft.filename, base64ToBlob(draft.base64, draft.contentType));
        toast.success(tx("admin.ledger.paper.gst.draftDone", { filename: draft.filename }));
      } else {
        const draft = await fetchPortalJsonDraft(billId);
        saveFile(
          draft.filename,
          new Blob([JSON.stringify(draft.document, null, 2)], { type: "application/json" }),
        );
        toast.success(tx("admin.ledger.paper.gst.draftDone", { filename: draft.filename }));
      }
    } catch (error) {
      toast.error(refusalMessage(tx, error, tx("admin.ledger.paper.gst.draftFailed")));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2">
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={busy != null}
        onClick={() => void handleDownload("pdf")}
      >
        {busy === "pdf" ? <Spinner /> : <FileTextIcon className="size-4" />}
        {busy === "pdf"
          ? tx("admin.ledger.paper.gst.actions.drawing")
          : tx("admin.ledger.paper.gst.actions.draftPdf")}
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="rounded-full"
        disabled={busy != null}
        onClick={() => void handleDownload("json")}
      >
        {busy === "json" ? <Spinner /> : <FileJsonIcon className="size-4" />}
        {tx("admin.ledger.paper.gst.actions.portalJson")}
      </Button>
    </div>
  );
}

// Each GST write shows when it applies. One the Bill's state would take but the Customer's
// deactivation refuses (reads only) shows disabled, its reason below, so it is not a surprise.
function GstActionButtons({
  gst,
  onOpen,
}: {
  gst: BillGstState;
  onOpen: (kind: GstDialogKind) => void;
}) {
  const tx = useTranslate();
  const live = !gst.cancelled;
  const showEnter = gst.allowed.enterIrn || (live && gst.irnPending);
  const showCorrect = gst.allowed.correctIrn || (live && gst.irnRecorded);
  const showPortal = gst.allowed.portalCancel || (live && gst.irnRecorded && !gst.filedMonth);
  const off = [
    showEnter && !gst.allowed.enterIrn ? gst.refusalReasons.enterIrn : null,
    showCorrect && !gst.allowed.correctIrn ? gst.refusalReasons.correctIrn : null,
    showPortal && !gst.allowed.portalCancel ? gst.refusalReasons.portalCancel : null,
  ].filter((reason): reason is string => Boolean(reason));
  const reasons = [...new Set(off)];
  if (!gst.allowed.draft && !showEnter && !showCorrect && !showPortal) return null;
  return (
    <div className="grid gap-2">
      {gst.allowed.draft && <DraftDownloads billId={gst.billId} />}
      {showEnter && (
        <Button
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          disabled={!gst.allowed.enterIrn}
          onClick={() => onOpen("enter_irn")}
        >
          {tx("admin.ledger.paper.gst.actions.enterIrn")}
        </Button>
      )}
      {showCorrect && (
        <Button
          variant="outline"
          className="rounded-full"
          disabled={!gst.allowed.correctIrn}
          onClick={() => onOpen("correct_irn")}
        >
          {tx("admin.ledger.paper.gst.actions.correctIrn")}
        </Button>
      )}
      {showPortal && (
        <Button
          variant="outline"
          className="rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={!gst.allowed.portalCancel}
          onClick={() => onOpen("portal_cancel")}
        >
          {tx("admin.ledger.paper.gst.actions.portalCancel")}
        </Button>
      )}
      {reasons.length > 0 && <OffReasons reasons={reasons} />}
    </div>
  );
}

function OffReasons({ reasons, className }: { reasons: string[]; className?: string }) {
  return (
    <ul className={cn("space-y-1 text-xs text-muted-foreground", className)}>
      {reasons.map((reason) => (
        <li key={reason} className="flex gap-1.5">
          <LockIcon className="mt-0.5 size-3 shrink-0" />
          {reason}
        </li>
      ))}
    </ul>
  );
}

/** Why Spec G's Correct and Cancel are off, visibly (a title tooltip does not show on a phone). */
export function BillGateReasons({ paper, className }: { paper: BillPaper; className?: string }) {
  const tx = useTranslate();
  const reasons = [
    ...new Set(
      [
        !paper.actions.canCorrect ? offReason(paper, "correct", tx) : undefined,
        !paper.actions.canCancel ? offReason(paper, "cancel", tx) : undefined,
      ].filter((reason): reason is string => Boolean(reason)),
    ),
  ];
  if (reasons.length === 0) return null;
  return <OffReasons reasons={reasons} className={className} />;
}

/** The GST card in the Bill paper's side panel: IRN status, fields and the GST actions. */
export function GstCard({
  gst,
  isLoading,
  isError,
  onRetry,
  onOpen,
}: {
  gst: BillGstState | null;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onOpen: (kind: GstDialogKind) => void;
}) {
  const tx = useTranslate();
  return (
    <section className="space-y-3 rounded-2xl border bg-card p-3">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{tx("admin.ledger.paper.gst.title")}</h2>
          {gst && (
            <div className="flex flex-wrap gap-1.5">
              <IrnStatusChip gst={gst} />
              {gst.filedMonth && <FiledMonthBadge />}
            </div>
          )}
        </div>
      </div>
      <div className="space-y-3">
        {isLoading ? (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : isError || !gst ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <p className="text-sm text-muted-foreground">
              {tx("admin.ledger.paper.gst.loadError")}
            </p>
            <Button size="sm" variant="outline" className="rounded-full" onClick={onRetry}>
              {tx("common.actions.tryAgain")}
            </Button>
          </div>
        ) : (
          <>
            <GstDetails gst={gst} />
            <GstActionButtons gst={gst} onOpen={onOpen} />
          </>
        )}
      </div>
    </section>
  );
}

// --- Forms, each in a modal dialog.

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}

type IrnErrors = Partial<
  Record<"irn" | "ackNumber" | "ackDate" | "signedQrText" | "image" | "reason", string>
>;

interface PickedImage {
  file: File;
  previewUrl: string;
  error: string | null;
}

/** Enter IRN (an IRN pending Bill) or Correct IRN (with a reason), with the optional signed QR image. */
function IrnForm({
  mode,
  gst,
  onDone,
}: {
  mode: "enter" | "correct";
  gst: BillGstState;
  onDone: () => void;
}) {
  const tx = useTranslate();
  const start = mode === "correct" ? gst.irn : null;
  const [irn, setIrn] = useState(start?.irn ?? "");
  const [ackNumber, setAckNumber] = useState(start?.ackNumber ?? "");
  const [ackDate, setAckDate] = useState(start?.ackDate ?? "");
  const [signedQrText, setSignedQrText] = useState(start?.signedQrText ?? "");
  const [image, setImage] = useState<PickedImage | null>(null);
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<IrnErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const [isReadingImage, setIsReadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { enterIrnAsync, isEnteringIrn, correctIrnAsync, isCorrectingIrn } = useBillGst();
  const isSaving = isEnteringIrn || isCorrectingIrn || isReadingImage;

  // The local preview is released when replaced or when the dialog closes.
  useEffect(() => {
    if (!image) return;
    return () => URL.revokeObjectURL(image.previewUrl);
  }, [image]);

  function handleFileSelected(file: File | undefined) {
    if (!file) return;
    const error = !IMAGE_TYPES.includes(file.type as ImageType)
      ? tx("admin.ledger.paper.gst.irnForm.errors.imageType")
      : file.size > MAX_IMAGE_BYTES
        ? tx("admin.ledger.paper.gst.irnForm.errors.imageSize")
        : null;
    setImage({ file, previewUrl: URL.createObjectURL(file), error });
  }

  function check(): boolean {
    const next: IrnErrors = {};
    if (!irn.trim()) next.irn = tx("admin.ledger.paper.gst.irnForm.errors.irn");
    if (!ackNumber.trim()) next.ackNumber = tx("admin.ledger.paper.gst.irnForm.errors.ackNumber");
    else if (ackNumber.trim().length > MAX_ACK_NUMBER_LENGTH)
      next.ackNumber = tx("admin.ledger.paper.gst.irnForm.errors.ackNumberLength");
    if (!ackDate) next.ackDate = tx("admin.ledger.paper.gst.irnForm.errors.ackDate");
    if (!signedQrText.trim())
      next.signedQrText = tx("admin.ledger.paper.gst.irnForm.errors.signedQrText");
    if (image?.error) next.image = image.error;
    if (mode === "correct" && !reason.trim())
      next.reason = tx("admin.ledger.paper.gst.irnForm.errors.reason");
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (isSaving || !check()) return;
    setRefusal(null);
    let signedQrImage: { contentType: ImageType; base64: string } | undefined;
    if (image) {
      setIsReadingImage(true);
      try {
        signedQrImage = {
          contentType: image.file.type as ImageType,
          base64: await fileToBase64(image.file),
        };
      } catch {
        setErrors({ image: tx("admin.ledger.paper.gst.irnForm.errors.imageRead") });
        return;
      } finally {
        setIsReadingImage(false);
      }
    }
    const fields = {
      billId: gst.billId,
      irn: irn.trim(),
      ackNumber: ackNumber.trim(),
      ackDate,
      signedQrText: signedQrText.trim(),
      signedQrImage,
    };
    try {
      if (mode === "enter") {
        await enterIrnAsync(fields);
        toast.success(tx("admin.ledger.paper.gst.irnForm.entered", { number: gst.billNumber }));
      } else {
        await correctIrnAsync({ ...fields, reason: reason.trim() });
        toast.success(tx("admin.ledger.paper.gst.irnForm.corrected", { number: gst.billNumber }));
      }
      onDone();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-3">
      {mode === "correct" && (
        <p className="text-sm text-muted-foreground">
          {tx("admin.ledger.paper.gst.irnForm.correctBody")}
        </p>
      )}
      {mode === "enter" && gst.filedMonth && (
        <p className="text-xs text-muted-foreground">
          {tx("admin.ledger.paper.gst.irnForm.lateIrn")}
        </p>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="irn-value">{tx("admin.ledger.paper.gst.fields.irn")}</Label>
        <Textarea
          id="irn-value"
          rows={2}
          className="font-mono text-xs"
          value={irn}
          disabled={isSaving}
          aria-invalid={Boolean(errors.irn)}
          onChange={(event) => setIrn(event.target.value)}
        />
        <FieldError message={errors.irn} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="irn-ack">{tx("admin.ledger.paper.gst.fields.ackNumber")}</Label>
          <Input
            id="irn-ack"
            value={ackNumber}
            inputMode="numeric"
            maxLength={MAX_ACK_NUMBER_LENGTH}
            disabled={isSaving}
            aria-invalid={Boolean(errors.ackNumber)}
            onChange={(event) => setAckNumber(event.target.value)}
          />
          <FieldError message={errors.ackNumber} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="irn-ack-date">{tx("admin.ledger.paper.gst.fields.ackDate")}</Label>
          <DatePicker id="irn-ack-date" value={ackDate} disabled={isSaving} onChange={setAckDate} />
          <FieldError message={errors.ackDate} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="irn-qr">{tx("admin.ledger.paper.gst.fields.signedQrText")}</Label>
        <Textarea
          id="irn-qr"
          rows={3}
          className="font-mono text-xs"
          value={signedQrText}
          disabled={isSaving}
          aria-invalid={Boolean(errors.signedQrText)}
          onChange={(event) => setSignedQrText(event.target.value)}
        />
        <FieldError message={errors.signedQrText} />
      </div>
      <div className="grid gap-1.5">
        <Label>{tx("admin.ledger.paper.gst.irnForm.image")}</Label>
        {image && !image.error && (
          // A local object URL of the picked file, before upload.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image.previewUrl}
            alt={tx("admin.ledger.paper.gst.irnForm.imageAlt")}
            className="size-28 rounded-xl border object-contain"
          />
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_TYPES.join(",")}
          className="hidden"
          onChange={(event) => {
            handleFileSelected(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="rounded-full"
            disabled={isSaving}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon className="size-4" />
            {image
              ? tx("admin.ledger.paper.gst.irnForm.changeImage")
              : tx("admin.ledger.paper.gst.irnForm.pickImage")}
          </Button>
          {image && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full"
              disabled={isSaving}
              onClick={() => {
                setImage(null);
                setErrors((current) => ({ ...current, image: undefined }));
              }}
            >
              {tx("admin.ledger.paper.gst.irnForm.removeImage")}
            </Button>
          )}
          {image && (
            <span className="truncate text-xs text-muted-foreground">{image.file.name}</span>
          )}
        </div>
        {mode === "correct" && gst.irn?.hasSignedQrImage && !image && (
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.gst.irnForm.correctImageHint")}
          </p>
        )}
        <FieldError message={errors.image ?? image?.error ?? undefined} />
      </div>
      {mode === "correct" && (
        <div className="grid gap-1.5">
          <ReasonField
            id="irn-reason"
            value={reason}
            onChange={setReason}
            disabled={isSaving}
            placeholder={tx("admin.ledger.paper.gst.irnForm.reasonPlaceholder")}
          />
          <FieldError message={errors.reason} />
        </div>
      )}
      {refusal && <RefusalAlert message={refusal} />}
      <DialogFooter>
        <Button variant="outline" className="rounded-full" disabled={isSaving} onClick={onDone}>
          {tx("common.actions.cancel")}
        </Button>
        <Button
          className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
          disabled={isSaving}
          onClick={() => void handleSubmit()}
        >
          {isSaving && <Spinner />}
          {isSaving
            ? tx("admin.ledger.saving")
            : mode === "enter"
              ? tx("admin.ledger.paper.gst.irnForm.submitEnter")
              : tx("admin.ledger.paper.gst.irnForm.submitCorrect")}
        </Button>
      </DialogFooter>
    </div>
  );
}

type PortalErrors = Partial<Record<"ackNumber" | "ackDate" | "reason", string>>;

/** Record portal cancellation: the IRN was already cancelled on the portal; this Cancels the Bill. */
function PortalCancelForm({
  gst,
  paper,
  onDone,
}: {
  gst: BillGstState;
  paper: BillPaper;
  onDone: () => void;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const today = businessToday();
  const [ackNumber, setAckNumber] = useState("");
  const [ackDate, setAckDate] = useState("");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [errors, setErrors] = useState<PortalErrors>({});
  const [refusal, setRefusal] = useState<string | null>(null);
  const { recordPortalCancellationAsync, isRecordingPortalCancellation } = useBillGst();

  async function handleSubmit() {
    if (isRecordingPortalCancellation) return;
    const next: PortalErrors = {};
    if (!ackNumber.trim())
      next.ackNumber = tx("admin.ledger.paper.gst.portalForm.errors.ackNumber");
    if (!ackDate) next.ackDate = tx("admin.ledger.paper.gst.portalForm.errors.ackDate");
    else if (ackDate > today)
      next.ackDate = tx("admin.ledger.paper.gst.portalForm.errors.ackDateFuture");
    if (!reason.trim()) next.reason = tx("admin.ledger.paper.gst.irnForm.errors.reason");
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setRefusal(null);
    try {
      const result = await recordPortalCancellationAsync({
        billId: gst.billId,
        ackNumber: ackNumber.trim(),
        ackDate,
        notes: notes.trim() || undefined,
        reason: reason.trim(),
      });
      toast.success(
        tx("admin.ledger.paper.gst.portalForm.done", {
          kind: tx(`admin.ledger.rowTypes.${result.data.creditNote.kind}`),
          number: result.data.creditNote.number,
          amount: formatPaise(result.data.creditNote.amountPaise),
        }),
      );
      onDone();
    } catch (error) {
      setRefusal(refusalMessage(tx, error, tx("admin.ledger.refusals.generic")));
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-1 rounded-xl border bg-muted/40 p-3">
        <p>{tx("admin.ledger.paper.gst.portalForm.body")}</p>
        <p className="text-muted-foreground">
          {paper.bill.orderId
            ? tx("admin.ledger.paper.cancel.stock")
            : tx("admin.ledger.paper.cancel.officeStock")}
        </p>
        <p className="text-muted-foreground">{tx("admin.ledger.paper.gst.portalForm.window")}</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="pc-ack">{tx("admin.ledger.paper.gst.portalForm.ackNumber")}</Label>
          <Input
            id="pc-ack"
            value={ackNumber}
            maxLength={MAX_ACK_NUMBER_LENGTH}
            disabled={isRecordingPortalCancellation}
            aria-invalid={Boolean(errors.ackNumber)}
            onChange={(event) => setAckNumber(event.target.value)}
          />
          <FieldError message={errors.ackNumber} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pc-date">{tx("admin.ledger.paper.gst.portalForm.ackDate")}</Label>
          <DatePicker
            id="pc-date"
            max={today}
            value={ackDate}
            disabled={isRecordingPortalCancellation}
            onChange={setAckDate}
          />
          <FieldError message={errors.ackDate} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="pc-notes">{tx("admin.ledger.paper.gst.portalForm.notes")}</Label>
        <Textarea
          id="pc-notes"
          rows={2}
          value={notes}
          disabled={isRecordingPortalCancellation}
          onChange={(event) => setNotes(event.target.value)}
        />
      </div>
      <div className="grid gap-1.5">
        <ReasonField
          id="pc-reason"
          value={reason}
          onChange={setReason}
          disabled={isRecordingPortalCancellation}
          placeholder={tx("admin.ledger.paper.gst.portalForm.reasonPlaceholder")}
        />
        <FieldError message={errors.reason} />
      </div>
      {refusal && <RefusalAlert message={refusal} />}
      <DialogFooter>
        <Button
          variant="outline"
          className="rounded-full"
          disabled={isRecordingPortalCancellation}
          onClick={onDone}
        >
          {tx("common.actions.cancel")}
        </Button>
        <Button
          variant="destructive"
          className="rounded-full"
          disabled={isRecordingPortalCancellation}
          onClick={() => void handleSubmit()}
        >
          {isRecordingPortalCancellation && <Spinner />}
          {isRecordingPortalCancellation
            ? tx("admin.ledger.saving")
            : tx("admin.ledger.paper.gst.portalForm.submit")}
        </Button>
      </DialogFooter>
    </div>
  );
}

const DIALOG_TITLE: Record<GstDialogKind, string> = {
  enter_irn: "admin.ledger.paper.gst.actions.enterIrn",
  correct_irn: "admin.ledger.paper.gst.actions.correctIrn",
  portal_cancel: "admin.ledger.paper.gst.actions.portalCancel",
};

/** Enter IRN, Correct IRN and Record portal cancellation, each in a modal dialog. */
export function GstDialog({
  kind,
  gst,
  paper,
  onClose,
}: {
  kind: GstDialogKind | null;
  gst: BillGstState | null;
  paper: BillPaper;
  onClose: () => void;
}) {
  const tx = useTranslate();
  return (
    <Dialog open={kind != null && gst != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[90dvh] flex-col gap-0 rounded-2xl p-0 sm:max-w-md">
        {/* Radix lays the viewport content out as a table; block keeps the content at the dialog width. */}
        <ScrollArea className="flex min-h-0 flex-col [&>[data-slot=scroll-area-viewport]>div]:block!">
          <div className="flex flex-col gap-4 p-6">
            <DialogHeader>
              <DialogTitle>{kind ? tx(DIALOG_TITLE[kind]) : ""}</DialogTitle>
              <DialogDescription>{paper.bill.number}</DialogDescription>
            </DialogHeader>
            {gst && kind === "enter_irn" && <IrnForm mode="enter" gst={gst} onDone={onClose} />}
            {gst && kind === "correct_irn" && <IrnForm mode="correct" gst={gst} onDone={onClose} />}
            {gst && kind === "portal_cancel" && (
              <PortalCancelForm gst={gst} paper={paper} onDone={onClose} />
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
