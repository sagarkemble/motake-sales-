"use client";

import { DownloadIcon, LockIcon, PrinterIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useDocumentDownloadLink, type BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { printElement } from "~/lib/print-element";
import { refusalMessage } from "~/lib/refusal";
import { cn } from "~/lib/utils";

const MUTED_CHIP = "border-transparent bg-muted text-muted-foreground";

export function StatusBadges({ paper }: { paper: BillPaper }) {
  const tx = useTranslate();
  const locked = paper.lock && (!paper.lock.correct.allowed || !paper.lock.cancel.allowed);
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="outline" className="border-transparent bg-brand/10 text-brand">
        {tx(`admin.bills.legalType.${paper.version.legalType}`)}
      </Badge>
      {paper.bill.orderId == null && (
        <Badge variant="outline" className={MUTED_CHIP}>
          {tx("admin.ledger.paper.officeBill")}
        </Badge>
      )}
      {paper.bill.cancelled && (
        <Badge variant="outline" className="border-transparent bg-destructive/10 text-destructive">
          {tx("admin.ledger.cancelled")}
        </Badge>
      )}
      {locked && (
        <Badge variant="outline" className={MUTED_CHIP}>
          {tx("admin.ledger.paper.locked")}
        </Badge>
      )}
      {paper.customer?.status === "inactive" && (
        <Badge variant="outline" className={MUTED_CHIP}>
          {tx("admin.ledger.paper.inactive")}
        </Badge>
      )}
    </div>
  );
}

// Why Correct (or Cancel) is off, for the button title and the notice.
export function offReason(
  paper: BillPaper,
  action: "correct" | "cancel",
  tx: (key: string) => string,
): string | undefined {
  if (paper.bill.cancelled) return tx("admin.ledger.paper.off.cancelled");
  if (paper.customer?.status === "inactive") return tx("admin.ledger.paper.off.inactive");
  const decision = paper.lock?.[action];
  if (decision && !decision.allowed) return decision.message;
  return undefined;
}

export function LockNotice({ paper }: { paper: BillPaper }) {
  const tx = useTranslate();
  if (paper.bill.cancelled)
    return (
      <Alert>
        <LockIcon />
        <AlertTitle>{tx("admin.ledger.paper.cancelledTitle")}</AlertTitle>
        <AlertDescription>{tx("admin.ledger.paper.cancelledBody")}</AlertDescription>
      </Alert>
    );
  if (paper.customer?.status === "inactive")
    return (
      <Alert>
        <AlertTitle>{tx("admin.ledger.inactive.title")}</AlertTitle>
        <AlertDescription>{tx("admin.ledger.inactive.body")}</AlertDescription>
      </Alert>
    );
  const decision = paper.lock?.correct.allowed === false ? paper.lock.correct : paper.lock?.cancel;
  if (decision && !decision.allowed)
    return (
      <Alert>
        <LockIcon />
        <AlertTitle>{tx("admin.ledger.paper.lockedTitle")}</AlertTitle>
        <AlertDescription>{decision.message}</AlertDescription>
      </Alert>
    );
  return null;
}

/** Opens the stored PDF through a 5-minute link, drawing it first when it was never drawn. */
export function DownloadPdfButton({
  target,
  label,
  className,
}: {
  target: { billVersionId: string } | { noteId: string };
  label?: string;
  className?: string;
}) {
  const tx = useTranslate();
  const { fetchDownloadLink } = useDocumentDownloadLink();
  const [isOpening, setIsOpening] = useState(false);

  async function handleDownload() {
    setIsOpening(true);
    // Opened before the await so a phone browser does not block it as a pop-up.
    const pdfWindow = window.open("", "_blank");
    try {
      const link = await fetchDownloadLink(target);
      if (pdfWindow) pdfWindow.location.href = link.url;
      else window.location.href = link.url;
    } catch (error) {
      pdfWindow?.close();
      toast.error(refusalMessage(tx, error, tx("admin.ledger.paper.pdfFailed")));
    } finally {
      setIsOpening(false);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isOpening}
      className={cn("rounded-full", className)}
      onClick={handleDownload}
    >
      {isOpening ? <Spinner /> : <DownloadIcon className="size-4" />}
      {isOpening
        ? tx("admin.ledger.paper.actions.opening")
        : (label ?? tx("admin.ledger.paper.actions.download"))}
    </Button>
  );
}

/** Prints the on-screen paper with the browser's print dialog; the PDF stays on Download. */
export function PrintPaperButton({
  paperElementId,
  className,
}: {
  paperElementId: string;
  className?: string;
}) {
  const tx = useTranslate();
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn("rounded-full", className)}
      onClick={() => printElement(paperElementId)}
    >
      <PrinterIcon className="size-4" />
      {tx("admin.ledger.paper.actions.print")}
    </Button>
  );
}

export function NotesList({ paper }: { paper: BillPaper }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  if (paper.notes.length === 0)
    return <p className="text-sm text-muted-foreground">{tx("admin.ledger.paper.notesEmpty")}</p>;
  return (
    <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-sm">
      {paper.notes.map((note) => (
        <li
          key={note.id}
          id={`note-${note.id}`}
          className="flex scroll-mt-20 flex-col gap-2 p-3 target:bg-brand-faint sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0 text-sm">
            <Link
              href={`/admin/ledger/notes/${note.id}`}
              className="font-medium underline-offset-4 hover:underline"
            >
              {tx(`admin.ledger.rowTypes.${note.kind}`)}{" "}
              <span className="font-mono text-xs text-muted-foreground">{note.number}</span>
            </Link>
            <p className="text-xs text-muted-foreground">
              {formatDate(note.issuedOn, "d MMM yyyy")} · “{note.reason}”
              {note.returnOrDamageOn &&
                ` · ${tx("admin.ledger.paper.returnedOn", {
                  date: formatDate(note.returnOrDamageOn, "d MMM yyyy"),
                })}`}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 sm:justify-end">
            <span className={cn("tabular-nums", note.kind !== "debit_note" && "text-brand")}>
              {note.kind === "debit_note" ? "+" : "−"} {formatPaise(note.amountPaise)}
            </span>
            <DownloadPdfButton
              target={{ noteId: note.id }}
              label={tx("admin.ledger.paper.actions.pdf")}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
