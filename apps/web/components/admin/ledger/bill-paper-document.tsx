"use client";

import { GstRate } from "~/components/shared/gst-rate";
import { QuantityStepper } from "~/components/shared/quantity-stepper";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import type { BillPaper } from "~/hooks/use-ledger";
import { useTranslate } from "~/hooks/use-translate";
import { billTaxRows } from "~/lib/bill-tax-rows";
import { cn } from "~/lib/utils";

type Totals = BillPaper["version"]["totals"];

// Correct in place: qty per line and the server-previewed totals. The buyer stays as issued.
export interface CorrectEdit {
  // True while the save runs: the steppers are greyed out.
  disabled: boolean;
  quantities: Record<string, number>;
  setQuantity: (lineId: string, quantity: number) => void;
  totals: Totals | null;
}

const cell = "border-y border-border px-2 py-2";

type PaperLine = BillPaper["lines"][number];

// One line as shown: an edited line shows its value at the frozen per-unit value; the totals are
// the server's exact preview.
function lineView(line: PaperLine, edit: CorrectEdit | undefined) {
  const quantity = edit ? (edit.quantities[line.id] ?? line.quantity) : line.quantity;
  const unitPaise = line.quantity > 0 ? line.amountPaise / line.quantity : 0;
  const changed = edit !== undefined && quantity !== line.quantity;
  const amountPaise = changed ? Math.round(unitPaise * quantity) : line.amountPaise;
  return { quantity, unitPaise, changed, amountPaise, floor: line.creditedQty };
}

function EditQuantity({ line, edit }: { line: PaperLine; edit: CorrectEdit }) {
  const tx = useTranslate();
  const { quantity, changed, floor } = lineView(line, edit);
  return (
    <div className="flex flex-col items-end gap-1 no-underline">
      <QuantityStepper
        quantity={quantity}
        minQuantity={0}
        disabled={edit.disabled}
        onQuantityChange={(next) => edit.setQuantity(line.id, next)}
      />
      {changed && (
        <span className="text-xs text-amber-700">
          {tx("admin.ledger.paper.was", { qty: line.quantity })}
        </span>
      )}
      {quantity > 0 && quantity < floor && (
        <span className="text-xs text-destructive">
          {tx("admin.ledger.paper.atLeast", { qty: floor })}
        </span>
      )}
    </div>
  );
}

// Correct on a phone: one card per line with the stepper in view, then Total and Round off.
function EditLinesList({
  paper,
  edit,
  totals,
}: {
  paper: BillPaper;
  edit: CorrectEdit;
  totals: Totals;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  return (
    <div className="py-3 sm:hidden">
      <ul className="divide-y rounded-xl border text-sm">
        {paper.lines.map((line) => {
          const { quantity, unitPaise, amountPaise } = lineView(line, edit);
          return (
            <li
              key={line.id}
              className={cn(
                "flex flex-col gap-2 px-3 py-2",
                quantity === 0 && "text-muted-foreground/60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={cn("min-w-0", quantity === 0 && "line-through")}>
                  {line.name}
                  <span className="block text-xs text-muted-foreground">
                    {formatPaise(Math.round(unitPaise))}{" "}
                    {tx("admin.ledger.paper.perUnit", { unit: line.unit })} ·{" "}
                    <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
                    {line.creditedQty > 0 &&
                      ` · ${tx("admin.ledger.paper.credited", { count: line.creditedQty })}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatPaise(amountPaise)}</span>
              </div>
              <EditQuantity line={line} edit={edit} />
            </li>
          );
        })}
      </ul>
      <dl className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 text-sm">
        <dt className="font-semibold">
          {tx("admin.ledger.paper.total")} · {totals.totalQuantity}
        </dt>
        <dd className="text-right font-semibold tabular-nums">{formatPaise(totals.totalPaise)}</dd>
        <dt className="text-muted-foreground">{tx("admin.ledger.paper.roundOff")}</dt>
        <dd className="text-right tabular-nums">{formatPaise(totals.roundOffPaise)}</dd>
      </dl>
    </div>
  );
}

/**
 * The Bill as issued: seller, buyer, Route stamp, items `# · Particulars · HSN/SAC · Rate · GST % ·
 * With GST · Qty · Amount`, Total with Round off, and the GST summary per rate.
 */
export function BillPaperDocument({ paper, edit }: { paper: BillPaper; edit?: CorrectEdit }) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { letterhead, totals: issuedTotals } = paper.version;
  const totals = edit?.totals ?? issuedTotals;
  // CGST and SGST, or IGST when inter-state; none on a Bill of Supply.
  const taxColumns = billTaxRows(issuedTotals).map((row) => row.tax);
  const { buyer } = letterhead;

  return (
    <article
      className={cn(
        "relative overflow-hidden rounded-2xl border bg-card p-4 text-card-foreground sm:p-6",
      )}
    >
      {paper.bill.cancelled && (
        <span className="pointer-events-none absolute right-4 top-16 rotate-[-12deg] rounded-lg border-4 border-destructive/60 px-3 py-1 text-2xl font-bold uppercase text-destructive/60">
          {tx("admin.ledger.cancelled")}
        </span>
      )}
      <header className="flex flex-col gap-3 border-b pb-3 sm:flex-row sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold">{letterhead.seller.legal_name}</p>
          <p className="text-xs text-muted-foreground">{letterhead.seller.address}</p>
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.gstin", { gstin: letterhead.seller.gstin })}
          </p>
        </div>
        <div className="text-left sm:text-right">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {tx(`admin.bills.legalType.${paper.version.legalType}`)}
          </p>
          <p className="font-mono text-sm font-semibold">{paper.bill.number}</p>
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.billDate")} {formatDate(paper.bill.billDate, "d MMM yyyy")}
          </p>
        </div>
      </header>
      <section className="grid gap-3 border-b py-3 text-sm sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{tx("admin.ledger.paper.billTo")}</p>
          <p className="font-medium">{buyer.shop_name}</p>
          <p className="text-xs text-muted-foreground">{buyer.address}</p>
          <p className="text-xs text-muted-foreground">{buyer.phone}</p>
          {letterhead.buyer.gstin && (
            <p className="text-xs text-muted-foreground">
              {tx("admin.ledger.paper.gstin", { gstin: letterhead.buyer.gstin })}
            </p>
          )}
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">{tx("admin.ledger.paper.route")}</p>
          <p>
            {letterhead.route.name} ({letterhead.route.code})
          </p>
          <p className="text-xs text-muted-foreground">
            {tx("admin.ledger.paper.placeOfSupply", { state: letterhead.route.delivery_state })}
          </p>
          <p className="text-xs text-muted-foreground">
            {tx(
              paper.bill.orderId ? "admin.ledger.paper.placed" : "admin.ledger.paper.officePlaced",
              {
                date: formatDate(paper.bill.placedAt, "d MMM yyyy, h:mm a"),
              },
            )}
          </p>
        </div>
      </section>

      {edit && <EditLinesList paper={paper} edit={edit} totals={totals} />}
      <div className={cn("-mx-4 overflow-x-auto py-3 sm:mx-0", edit && "hidden sm:block")}>
        <table className="w-full min-w-[40rem] border-collapse border border-border text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className={cn(cell, "w-8 font-medium")}>
                {tx("admin.ledger.paper.columns.index")}
              </th>
              <th className={cn(cell, "font-medium")}>
                {tx("admin.ledger.paper.columns.particulars")}
              </th>
              <th className={cn(cell, "font-medium")}>{tx("admin.ledger.paper.columns.hsn")}</th>
              <th className={cn(cell, "text-right font-medium")}>
                {tx("admin.ledger.paper.columns.rate")}
              </th>
              <th className={cn(cell, "text-right font-medium")}>
                {tx("admin.ledger.paper.columns.gst")}
              </th>
              <th className={cn(cell, "text-right font-medium")}>
                {tx("admin.ledger.paper.columns.withGst")}
              </th>
              <th className={cn(cell, "text-right font-medium")}>
                {tx("admin.ledger.paper.columns.qty")}
              </th>
              <th className={cn(cell, "text-right font-medium")}>
                {tx("admin.ledger.paper.columns.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {paper.lines.map((line, index) => {
              const { quantity, unitPaise, amountPaise } = lineView(line, edit);
              return (
                <tr
                  key={line.id}
                  className={cn(
                    "align-top",
                    quantity === 0 && "text-muted-foreground/60 line-through",
                  )}
                >
                  <td className={cell}>{index + 1}</td>
                  <td className={cell}>
                    {line.name}
                    <span className="block text-xs text-muted-foreground">
                      {tx("admin.ledger.paper.perUnit", { unit: line.unit })}
                      {line.creditedQty > 0 &&
                        ` · ${tx("admin.ledger.paper.credited", { count: line.creditedQty })}`}
                    </span>
                  </td>
                  <td className={cn(cell, "font-mono text-xs")}>{line.hsn}</td>
                  <td className={cn(cell, "text-right tabular-nums")}>
                    {formatPaise(line.routePricePaise)}
                  </td>
                  <td className={cn(cell, "text-right text-xs tabular-nums")}>
                    <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
                  </td>
                  <td className={cn(cell, "text-right tabular-nums")}>
                    {formatPaise(Math.round(unitPaise))}
                  </td>
                  <td className={cn(cell, "text-right tabular-nums")}>
                    {edit ? <EditQuantity line={line} edit={edit} /> : quantity}
                  </td>
                  <td className={cn(cell, "text-right tabular-nums")}>
                    {formatPaise(amountPaise)}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold">
              <td className={cell} colSpan={6}>
                {tx("admin.ledger.paper.total")}
              </td>
              <td className={cn(cell, "text-right tabular-nums")}>{totals.totalQuantity}</td>
              <td className={cn(cell, "text-right tabular-nums")}>
                {formatPaise(totals.totalPaise)}
              </td>
            </tr>
            <tr>
              <td className={cell} colSpan={6}>
                {tx("admin.ledger.paper.roundOff")}
              </td>
              <td className={cell} />
              <td className={cn(cell, "text-right tabular-nums")}>
                {formatPaise(totals.roundOffPaise)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!edit && paper.gstSummary.length > 0 && (
        <div className="-mx-4 overflow-x-auto sm:mx-0">
          <p className="mb-1 text-xs font-medium text-muted-foreground">
            {tx("admin.ledger.paper.gstSummary.title")}
          </p>
          <table className="w-full min-w-[28rem] border-collapse border border-border text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th className="border border-border px-2 py-1.5 text-left font-medium">
                  {tx("admin.ledger.paper.gstSummary.rate")}
                </th>
                <th className="border border-border px-2 py-1.5 text-right font-medium">
                  {tx("admin.ledger.paper.gstSummary.taxable")}
                </th>
                {taxColumns.map((tax) => (
                  <th key={tax} className="border border-border px-2 py-1.5 text-right font-medium">
                    {tx(`admin.bills.${tax}`)}
                  </th>
                ))}
                <th className="border border-border px-2 py-1.5 text-right font-medium">
                  {tx("admin.ledger.paper.gstSummary.tax")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paper.gstSummary.map((row) => (
                <tr key={`${row.gstRateBps}-${row.exempt}`}>
                  <td className="border border-border px-2 py-1.5">
                    <GstRate gstRateBps={row.gstRateBps} exempt={row.exempt} />
                  </td>
                  <td className="border border-border px-2 py-1.5 text-right tabular-nums">
                    {formatPaise(row.taxablePaise)}
                  </td>
                  {taxColumns.map((tax) => (
                    <td
                      key={tax}
                      className="border border-border px-2 py-1.5 text-right tabular-nums"
                    >
                      {formatPaise(row[`${tax}Paise`])}
                    </td>
                  ))}
                  <td className="border border-border px-2 py-1.5 text-right tabular-nums">
                    {formatPaise(row.taxPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paper.bill.billNote && (
        <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">
          {tx("admin.ledger.paper.billNote", { note: paper.bill.billNote })}
        </p>
      )}
    </article>
  );
}
