"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { BillPaperDocument } from "~/components/admin/ledger/bill-paper-document";
import {
  BillGateReasons,
  GstCard,
  GstDialog,
  type GstDialogKind,
} from "~/components/admin/ledger/bill-paper-gst";
import {
  CancelForm,
  CorrectPanel,
  RaiseNoteForm,
  toCorrectEdit,
  useCorrectPreview,
  useCorrectState,
} from "~/components/admin/ledger/bill-paper-forms";
import {
  DownloadPdfButton,
  LockNotice,
  NotesList,
  StatusBadges,
  offReason,
} from "~/components/admin/ledger/bill-paper-parts";
import {
  LedgerBackHeader,
  PaperLoadFailed,
  useBalanceText,
} from "~/components/admin/ledger/ledger-shared";
import { PaperWhatsapp } from "~/components/admin/ledger/paper-whatsapp";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { useBillGst } from "~/hooks/use-gst";
import { useBillPaper, type BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

type SheetKind = "cancel" | "note";

function BackLink({ paper }: { paper: BillPaper | null }) {
  const searchParams = useSearchParams();
  // Opened from the GST page's IRN pending list: Back returns there.
  const fromGst = searchParams.get("from") === "gst";
  return (
    <LedgerBackHeader
      customerId={paper?.customer?.id}
      shopName={paper?.customer?.shopName}
      href={fromGst ? "/admin/gst?tab=irn" : undefined}
    />
  );
}

function PaperView({ paper }: { paper: BillPaper }) {
  const tx = useTranslate();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const balanceText = useBalanceText();
  const [isEditOpen, setEditing] = useState(false);
  // A reload that finds the Bill cancelled or locked ends the edit; its notice says why.
  const editing = isEditOpen && paper.actions.canCorrect;
  const [sheet, setSheet] = useState<SheetKind | null>(
    searchParams.get("action") === "note" && paper.actions.canRaiseNote ? "note" : null,
  );
  const [gstDialog, setGstDialog] = useState<GstDialogKind | null>(null);
  const { billGstState, isBillGstStateLoading, isBillGstStateError, refetchBillGstState } =
    useBillGst({ billId: paper.bill.id });
  const correctState = useCorrectState(paper);
  const correct = useBillPaper();
  // One Raise Note key per paper, kept across sheet closes and rotated only once a Note is raised.
  const [noteKey, setNoteKey] = useState(() => crypto.randomUUID());
  const correctPreview = useCorrectPreview(
    paper,
    editing ? correctState : { ...correctState, hasChanges: false },
  );
  // One WhatsApp entry, at the top on a phone and in the side panel on a wide screen.
  const whatsapp = (
    <PaperWhatsapp
      document={{ billId: paper.bill.id }}
      title={`${tx("whatsapp.template.bill")} ${paper.bill.number}`}
      context={{
        customerActive: paper.customer?.status !== "inactive",
        billCancelled: paper.bill.cancelled,
      }}
      latestBill={{
        billId: paper.bill.id,
        number: paper.bill.number,
        version: paper.bill.latestVersionNumber,
        balanceText: paper.balance ? balanceText(paper.balance) : "",
        cancelled: paper.bill.cancelled,
        irnPending: billGstState?.irnPending ?? false,
      }}
      // The Bill's list also has its Notes' messages; each shows the Note's number.
      detailOf={(row) => {
        const [document, noteId] = row.businessRef.split("/");
        if (document !== "note") return null;
        return paper.notes.find((note) => note.id === noteId)?.number ?? null;
      }}
    />
  );

  function closeSheet() {
    setSheet(null);
    // Drop ?action=note so a reload does not reopen the sheet.
    if (searchParams.get("action")) router.replace(pathname, { scroll: false });
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <BackLink paper={paper} />
        {paper.balance && (
          <span className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.balanceNow", { balance: balanceText(paper.balance) })}
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="lg:hidden">{whatsapp}</div>
          <LockNotice paper={paper} />
          {editing && (
            <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {tx("admin.ledger.paper.editing", {
                version: paper.bill.latestVersionNumber,
                next: paper.bill.latestVersionNumber + 1,
              })}
            </p>
          )}
          <BillPaperDocument
            paper={paper}
            edit={
              editing
                ? toCorrectEdit(correctState, correctPreview, correct.isCorrectingBill)
                : undefined
            }
          />
          <h2 className="text-sm font-medium">{tx("admin.ledger.paper.notesTitle")}</h2>
          <NotesList paper={paper} />
        </div>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-3 rounded-2xl border bg-card p-3">
            <div>
              <p className="font-mono text-base font-semibold">{paper.bill.number}</p>
              {paper.customer && (
                <p className="truncate text-xs text-muted-foreground">{paper.customer.shopName}</p>
              )}
            </div>
            <StatusBadges paper={paper} />
            <div className="hidden lg:block">{whatsapp}</div>
            {!editing ? (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <Button
                  className="col-span-2 rounded-full bg-brand text-brand-foreground hover:bg-brand/90 lg:col-span-1"
                  disabled={!paper.actions.canCorrect}
                  title={offReason(paper, "correct", tx)}
                  onClick={() => setEditing(true)}
                >
                  {tx("admin.ledger.paper.actions.correct")}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full"
                  disabled={!paper.actions.canRaiseNote}
                  onClick={() => setSheet("note")}
                >
                  {tx("admin.ledger.paper.actions.raiseNote")}
                </Button>
                <Button
                  variant="outline"
                  className="rounded-full border-destructive text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={!paper.actions.canCancel}
                  title={offReason(paper, "cancel", tx)}
                  onClick={() => setSheet("cancel")}
                >
                  {tx("admin.ledger.paper.actions.cancel")}
                </Button>
                {/* While IRN pending the final PDF is not drawn; the GST card has the Draft PDF. */}
                {!billGstState?.allowed.draft && (
                  <DownloadPdfButton
                    className="col-span-2 lg:col-span-1"
                    target={{ billVersionId: paper.version.id }}
                  />
                )}
                <BillGateReasons paper={paper} className="col-span-2 lg:col-span-1" />
              </div>
            ) : (
              <CorrectPanel
                paper={paper}
                state={correctState}
                preview={correctPreview}
                correct={correct}
                onClose={() => setEditing(false)}
                onSaved={() => setEditing(false)}
              />
            )}
          </div>
          <GstCard
            gst={billGstState}
            isLoading={isBillGstStateLoading}
            isError={isBillGstStateError}
            onRetry={() => void refetchBillGstState()}
            onOpen={setGstDialog}
          />
        </aside>
      </div>
      <Sheet open={sheet != null} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {sheet === "cancel"
                ? tx("admin.ledger.paper.cancel.title")
                : tx("admin.ledger.paper.note.title")}
            </SheetTitle>
            <SheetDescription>{paper.bill.number}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-6">
            {sheet === "cancel" && <CancelForm paper={paper} onDone={closeSheet} />}
            {sheet === "note" && (
              <RaiseNoteForm
                paper={paper}
                idempotencyKey={noteKey}
                onRaised={() => setNoteKey(crypto.randomUUID())}
                onDone={closeSheet}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>
      <GstDialog
        kind={gstDialog}
        gst={billGstState}
        paper={paper}
        onClose={() => setGstDialog(null)}
      />
    </div>
  );
}

function BillPaperPageContent() {
  const tx = useTranslate();
  const { billId } = useParams<{ billId: string }>();
  const { billPaper, isBillPaperLoading, refetchBillPaper } = useBillPaper({ billId });

  if (isBillPaperLoading) return <DetailPageSkeleton />;

  if (!billPaper) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4">
        <BackLink paper={null} />
        <PaperLoadFailed
          message={tx("admin.ledger.paper.loadError.title")}
          onRetry={() => void refetchBillPaper()}
        />
      </div>
    );
  }

  // Keyed by version, so Correct's edit state starts from the latest lines after every save.
  return (
    <PaperView key={`${billPaper.bill.id}-${billPaper.version.versionNumber}`} paper={billPaper} />
  );
}

export default function AdminBillPaperPage() {
  return (
    <Suspense fallback={<DetailPageSkeleton />}>
      <BillPaperPageContent />
    </Suspense>
  );
}
