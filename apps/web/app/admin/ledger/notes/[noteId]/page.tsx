"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";

import { DownloadPdfButton } from "~/components/admin/ledger/bill-paper-parts";
import {
  LedgerBackHeader,
  PaperLoadFailed,
  useBalanceText,
} from "~/components/admin/ledger/ledger-shared";
import { PaperWhatsapp } from "~/components/admin/ledger/paper-whatsapp";
import { DetailPageSkeleton } from "~/components/shared/detail-page-skeleton";
import { GstRate } from "~/components/shared/gst-rate";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useBillPaper, type NotePaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { billTaxRows } from "~/lib/bill-tax-rows";
import { cn } from "~/lib/utils";

const cell = "border-y border-border px-2 py-2";

type NoteLine = NotePaper["lines"][number];

function lineTotalOf(line: NoteLine) {
  return line.amountPaise + line.cgstPaise + line.sgstPaise + line.igstPaise;
}

function NoteDocument({ paper }: { paper: NotePaper }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { note, bill } = paper;
  const taxablePaise = paper.lines.reduce((total, line) => total + line.amountPaise, 0);
  const lineTotalPaise = paper.lines.reduce((total, line) => total + lineTotalOf(line), 0);
  // A Commercial Credit Note carries no GST.
  const showsGst = note.kind !== "commercial_credit_note";
  const taxRows = billTaxRows({
    legalType: showsGst ? "tax_invoice" : "bill_of_supply",
    cgstPaise: note.cgstPaise,
    sgstPaise: note.sgstPaise,
    igstPaise: note.igstPaise,
  });

  return (
    <article className="rounded-2xl border bg-card px-4 py-3">
      <header className="flex flex-col gap-1 border-b pb-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {tx(`admin.ledger.rowTypes.${note.kind}`)}
        </p>
        <p className="font-mono text-sm font-semibold">{note.number}</p>
        <p className="text-xs text-muted-foreground">
          {tx("admin.ledger.paper.notePage.issuedOn", {
            date: formatDate(note.issuedOn, "d MMM yyyy"),
          })}
          {" · "}
          {tx("admin.ledger.paper.notePage.ofBill", {
            number: bill.number,
            date: formatDate(bill.billDate, "d MMM yyyy"),
          })}
        </p>
      </header>
      <section className="border-b py-3 text-sm">
        <p className="text-xs text-muted-foreground">{tx("admin.ledger.paper.notePage.reason")}</p>
        <p className="whitespace-pre-line break-words">{note.reason}</p>
        {note.returnOrDamageOn && (
          <p className="mt-1 text-xs text-muted-foreground">
            {tx("admin.ledger.paper.returnedOn", {
              date: formatDate(note.returnOrDamageOn, "d MMM yyyy"),
            })}
          </p>
        )}
      </section>

      {paper.lines.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {tx("admin.ledger.paper.notePage.noLines")}
        </p>
      ) : (
        <div className="-mx-4 overflow-x-auto py-3 sm:mx-0">
          <table className="w-full min-w-[22rem] border-collapse border border-border text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className={cn(cell, "w-8 font-medium")}>
                  {tx("admin.ledger.paper.columns.index")}
                </th>
                <th className={cn(cell, "font-medium")}>
                  {tx("admin.ledger.paper.columns.particulars")}
                </th>
                {showsGst && (
                  <th className={cn(cell, "text-right font-medium")}>
                    {tx("admin.ledger.paper.columns.gst")}
                  </th>
                )}
                <th className={cn(cell, "text-right font-medium")}>
                  {tx("admin.ledger.paper.columns.qty")}
                </th>
                <th className={cn(cell, "text-right font-medium")}>
                  {tx("admin.ledger.paper.columns.amount")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paper.lines.map((line, index) => (
                <tr key={line.id} className="align-top">
                  <td className={cell}>{index + 1}</td>
                  <td className={cell}>
                    {line.name}
                    <span className="block text-xs text-muted-foreground">
                      {line.unit && `${tx("admin.ledger.paper.perUnit", { unit: line.unit })} · `}
                      <span className="font-mono">{line.hsn}</span>
                    </span>
                  </td>
                  {showsGst && (
                    <td className={cn(cell, "text-right text-xs tabular-nums")}>
                      <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
                    </td>
                  )}
                  <td className={cn(cell, "text-right tabular-nums")}>{line.quantity}</td>
                  <td className={cn(cell, "text-right tabular-nums")}>
                    {formatPaise(lineTotalOf(line))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <dl className="ml-auto grid max-w-xs grid-cols-[1fr_auto] gap-x-4 gap-y-1 py-2 text-sm">
        {taxRows.length > 0 && (
          <>
            <dt className="text-muted-foreground">{tx("admin.bills.taxable")}</dt>
            <dd className="text-right tabular-nums">{formatPaise(taxablePaise)}</dd>
            {taxRows.map((row) => (
              <div key={row.tax} className="contents">
                <dt className="text-muted-foreground">{tx(`admin.bills.${row.tax}`)}</dt>
                <dd className="text-right tabular-nums">{formatPaise(row.paise)}</dd>
              </div>
            ))}
          </>
        )}
        <dt className="text-muted-foreground">{tx("admin.ledger.paper.roundOff")}</dt>
        <dd className="text-right tabular-nums">
          {formatPaise(note.amountPaise - lineTotalPaise)}
        </dd>
        <dt className="font-semibold">{tx("admin.ledger.paper.total")}</dt>
        <dd
          className={cn(
            "text-right font-semibold tabular-nums",
            note.kind !== "debit_note" && "text-brand",
          )}
        >
          {note.kind === "debit_note" ? "+" : "−"} {formatPaise(note.amountPaise)}
        </dd>
      </dl>
    </article>
  );
}

function NotePaperView({ paper }: { paper: NotePaper }) {
  const tx = useTranslate();
  const balanceText = useBalanceText();
  const title = `${tx(`admin.ledger.rowTypes.${paper.note.kind}`)} ${paper.note.number}`;
  // One WhatsApp entry, at the top on a phone and in the side panel on a wide screen.
  const whatsapp = (
    <PaperWhatsapp
      document={{ noteId: paper.note.id }}
      title={title}
      context={{
        customerActive: paper.customer?.status !== "inactive",
        billCancelled: paper.bill.cancelled,
      }}
    />
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <LedgerBackHeader
          customerId={paper.customer?.id}
          shopName={paper.customer?.shopName}
          paperLabel={tx(`admin.ledger.rowTypes.${paper.note.kind}`)}
        />
        {paper.balance && (
          <span className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.balanceNow", { balance: balanceText(paper.balance) })}
          </span>
        )}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="lg:hidden">{whatsapp}</div>
          {paper.bill.cancelled && (
            <p className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
              {tx("admin.ledger.paper.notePage.cancelledBill")}
            </p>
          )}
          <NoteDocument paper={paper} />
        </div>
        <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <div className="space-y-3 rounded-2xl border bg-card p-3">
            <div>
              <p className="font-mono text-base font-semibold">{paper.note.number}</p>
              {paper.customer && (
                <p className="truncate text-xs text-muted-foreground">{paper.customer.shopName}</p>
              )}
            </div>
            <Badge variant="outline">{tx(`admin.ledger.rowTypes.${paper.note.kind}`)}</Badge>
            <div className="hidden lg:block">{whatsapp}</div>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              <Button
                asChild
                className="rounded-full bg-brand text-brand-foreground hover:bg-brand/90"
              >
                <Link href={`/admin/ledger/bills/${paper.bill.id}`}>
                  {tx("admin.ledger.paper.notePage.openBill")}
                </Link>
              </Button>
              <DownloadPdfButton target={{ noteId: paper.note.id }} />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function NotePaperPageContent() {
  const tx = useTranslate();
  const { noteId } = useParams<{ noteId: string }>();
  const { notePaper, isNotePaperLoading, refetchNotePaper } = useBillPaper({ noteId });

  if (isNotePaperLoading) return <DetailPageSkeleton />;

  if (!notePaper) {
    return (
      <div className="mx-auto flex max-w-4xl flex-col gap-3 px-4 py-4">
        <LedgerBackHeader />
        <PaperLoadFailed
          message={tx("admin.ledger.paper.notePage.loadError")}
          onRetry={() => void refetchNotePaper()}
        />
      </div>
    );
  }

  return <NotePaperView paper={notePaper} />;
}

export default function AdminNotePaperPage() {
  return (
    <Suspense fallback={<DetailPageSkeleton />}>
      <NotePaperPageContent />
    </Suspense>
  );
}
