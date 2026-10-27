"use client";

import { AlertCircleIcon, ChevronLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import { BillPaperDocument } from "~/components/admin/ledger/bill-paper-document";
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
import { ledgerReturnHref, useBalanceText } from "~/components/admin/ledger/ledger-shared";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Button } from "~/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "~/components/ui/sheet";
import { Skeleton } from "~/components/ui/skeleton";
import { useBillPaper, type BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";

type SheetKind = "cancel" | "note";

function BackLink({ paper }: { paper: BillPaper | null }) {
  const tx = useTranslate();
  const customerId = paper?.customer?.id;
  const [href, setHref] = useState(
    customerId ? `/admin/ledger?customer=${customerId}` : "/admin/ledger",
  );
  // Read after mount: the saved Ledger URL lives in this tab's session storage.
  useEffect(() => setHref(ledgerReturnHref(customerId)), [customerId]);
  return (
    <Link
      href={href}
      className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
    >
      <ChevronLeftIcon className="size-4" />
      {paper?.customer
        ? tx("admin.ledger.paper.back", { shopName: paper.customer.shopName })
        : tx("admin.ledger.title")}
    </Link>
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
  const correctState = useCorrectState(paper);
  const correct = useBillPaper();
  // One Raise Note key per paper, kept across sheet closes and rotated only once a Note is raised.
  const [noteKey, setNoteKey] = useState(() => crypto.randomUUID());
  const correctPreview = useCorrectPreview(
    paper,
    editing ? correctState : { ...correctState, hasChanges: false },
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
          <LockNotice paper={paper} />
          {editing && (
            <p className="rounded-md bg-amber-100 px-3 py-2 text-sm text-amber-900">
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
          <div className="space-y-3 rounded-md border bg-card p-3">
            <div>
              <p className="font-mono text-base font-semibold">{paper.bill.number}</p>
              {paper.customer && (
                <p className="truncate text-xs text-muted-foreground">{paper.customer.shopName}</p>
              )}
            </div>
            <StatusBadges paper={paper} />
            {!editing ? (
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
                <Button
                  className="col-span-2 lg:col-span-1"
                  disabled={!paper.actions.canCorrect}
                  title={offReason(paper, "correct", tx)}
                  onClick={() => setEditing(true)}
                >
                  {tx("admin.ledger.paper.actions.correct")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!paper.actions.canRaiseNote}
                  onClick={() => setSheet("note")}
                >
                  {tx("admin.ledger.paper.actions.raiseNote")}
                </Button>
                <Button
                  variant="outline"
                  disabled={!paper.actions.canCancel}
                  title={offReason(paper, "cancel", tx)}
                  onClick={() => setSheet("cancel")}
                >
                  {tx("admin.ledger.paper.actions.cancel")}
                </Button>
                <DownloadPdfButton
                  className="col-span-2 lg:col-span-1"
                  target={{ billVersionId: paper.version.id }}
                />
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
    </div>
  );
}

function BillPaperPageContent() {
  const tx = useTranslate();
  const { billId } = useParams<{ billId: string }>();
  const { billPaper, isBillPaperLoading, refetchBillPaper } = useBillPaper({ billId });

  if (isBillPaperLoading) {
    return (
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Skeleton className="h-[28rem] w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  if (!billPaper) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4">
        <BackLink paper={null} />
        <Alert variant="destructive">
          <AlertCircleIcon />
          <AlertTitle>{tx("admin.ledger.paper.loadError.title")}</AlertTitle>
          <AlertDescription>
            <p>{tx("admin.ledger.paper.loadError.body")}</p>
            <Button size="sm" variant="outline" className="mt-2" onClick={() => refetchBillPaper()}>
              {tx("common.actions.tryAgain")}
            </Button>
          </AlertDescription>
        </Alert>
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
    <Suspense fallback={null}>
      <BillPaperPageContent />
    </Suspense>
  );
}
