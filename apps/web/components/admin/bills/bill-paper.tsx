"use client";

import type { RouterOutputs } from "@repo/trpc/client";
import { ReceiptTextIcon } from "lucide-react";

import { GstRate } from "~/components/shared/gst-rate";
import { OrderStatusBadge } from "~/components/shared/order-status-badge";
import { Button } from "~/components/ui/button";
import { ScrollArea, ScrollBar } from "~/components/ui/scroll-area";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { billTaxRows } from "~/lib/bill-tax-rows";
import { cn } from "~/lib/utils";

type BillDetail = RouterOutputs["bills"]["getById"]["data"];

interface BillPaperProps {
  bill: BillDetail;
  onOpenOrder?: (orderId: string) => void;
}

const cellClassName = "border-y border-border px-2 py-2";

/** Read-only view of the current Bill, with every figure as frozen at issue. */
export function BillPaper({ bill, onOpenOrder }: BillPaperProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();
  const { letterhead } = bill;

  const totalRows: [string, number][] = [
    [tx("admin.bills.taxable"), bill.taxablePaise],
    ...billTaxRows(bill).map(({ tax, paise }): [string, number] => [
      tx(`admin.bills.${tax}`),
      paise,
    ]),
    [tx("admin.bills.roundOff"), bill.roundOffPaise],
  ];

  return (
    <div className="flex flex-col gap-4">
      {bill.cancelled && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {tx("admin.bills.cancelledNotice", { number: bill.number })}
        </p>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-xl">{tx(`admin.bills.legalType.${bill.legalType}`)}</p>
          <p
            className={cn(
              "font-mono text-sm",
              bill.cancelled && "text-muted-foreground line-through",
            )}
          >
            {bill.number}
          </p>
          <p className="text-xs text-muted-foreground">
            {tx("admin.bills.billDate")} {formatDate(bill.billDate, "d MMM yyyy")}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          {bill.cancelled && <OrderStatusBadge status="cancelled" />}
          {bill.orderId ? (
            onOpenOrder && (
              <Button
                type="button"
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs text-brand"
                onClick={() => bill.orderId && onOpenOrder(bill.orderId)}
              >
                {tx("admin.bills.openOrder")}
              </Button>
            )
          ) : (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <ReceiptTextIcon className="size-3.5" /> {tx("admin.bills.fromOffice")}
            </span>
          )}
        </div>
      </div>

      <section className="grid gap-4 rounded-md border p-4 text-sm sm:grid-cols-3">
        <LetterheadBlock label={tx("admin.bills.seller")}>
          <p className="font-medium">{letterhead.seller.legal_name}</p>
          <p className="text-xs text-muted-foreground">{letterhead.seller.address}</p>
          <p className="font-mono text-xs">GSTIN {letterhead.seller.gstin}</p>
        </LetterheadBlock>
        <LetterheadBlock label={tx("admin.bills.buyer")}>
          <p className="font-medium">{letterhead.buyer.shop_name}</p>
          <p className="text-xs text-muted-foreground">{letterhead.buyer.address}</p>
          <p className="text-xs text-muted-foreground">{letterhead.buyer.phone}</p>
          <p className="font-mono text-xs">
            {letterhead.buyer.gstin
              ? `GSTIN ${letterhead.buyer.gstin}`
              : tx("admin.bills.unregistered")}
          </p>
        </LetterheadBlock>
        <LetterheadBlock label={tx("admin.orders.route")}>
          <p className="font-medium">{letterhead.route.name}</p>
          <p className="font-mono text-xs text-muted-foreground">{letterhead.route.code}</p>
          <p className="text-xs">
            {tx("admin.bills.deliveryState")} {letterhead.route.delivery_state}
          </p>
        </LetterheadBlock>
      </section>

      {bill.irn && (
        <section className="grid gap-1 rounded-md border bg-muted/30 p-3 text-xs sm:grid-cols-[auto_1fr] sm:gap-x-4">
          <span className="text-muted-foreground">IRN</span>
          <span className="font-mono break-all">{bill.irn}</span>
          {bill.irnAckNumber && (
            <>
              <span className="text-muted-foreground">{tx("admin.bills.ackNumber")}</span>
              <span className="font-mono">{bill.irnAckNumber}</span>
            </>
          )}
          {bill.irnAckDate && (
            <>
              <span className="text-muted-foreground">{tx("admin.bills.ackDate")}</span>
              <span>{bill.irnAckDate}</span>
            </>
          )}
        </section>
      )}

      <ScrollArea>
        <table className="w-full min-w-[44rem] border-collapse border border-border text-sm">
          <thead>
            <tr>
              <th className={cn(cellClassName, "w-8 text-right font-medium")}>#</th>
              <th className={cn(cellClassName, "text-left font-medium")}>
                {tx("admin.bills.particulars")}
              </th>
              <th className={cn(cellClassName, "text-right font-medium")}>HSN</th>
              <th className={cn(cellClassName, "text-right font-medium")}>
                {tx("common.fields.qty")}
              </th>
              <th className={cn(cellClassName, "text-right font-medium")}>
                {tx("admin.bills.rate")}
              </th>
              <th className={cn(cellClassName, "text-right font-medium")}>GST %</th>
              <th className={cn(cellClassName, "text-right font-medium")}>
                {tx("admin.bills.taxable")}
              </th>
              <th className={cn(cellClassName, "text-right font-medium")}>
                {tx("admin.bills.amount")}
              </th>
            </tr>
          </thead>
          <tbody>
            {bill.items.map((line, index) => (
              <tr key={line.id}>
                <td className={cn(cellClassName, "text-right tabular-nums")}>{index + 1}</td>
                <td className={cellClassName}>
                  {line.stamp.name}
                  <span className="text-xs text-muted-foreground"> · {line.stamp.unit}</span>
                </td>
                <td className={cn(cellClassName, "text-right font-mono text-xs")}>
                  {line.stamp.hsn}
                </td>
                <td className={cn(cellClassName, "text-right tabular-nums")}>{line.quantity}</td>
                <td className={cn(cellClassName, "text-right tabular-nums")}>
                  {formatPaise(line.routePricePaise)}
                </td>
                <td className={cn(cellClassName, "text-right")}>
                  <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
                </td>
                <td className={cn(cellClassName, "text-right tabular-nums")}>
                  {formatPaise(line.taxablePaise)}
                </td>
                <td className={cn(cellClassName, "text-right tabular-nums")}>
                  {formatPaise(
                    line.taxablePaise + line.cgstPaise + line.sgstPaise + line.igstPaise,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={cn(cellClassName, "font-medium")} colSpan={3}>
                {tx("admin.orders.totalQuantity")}
              </td>
              <td className={cn(cellClassName, "text-right font-medium tabular-nums")}>
                {bill.totalQuantity}
              </td>
              <td className={cellClassName} colSpan={4} />
            </tr>
          </tfoot>
        </table>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>

      <dl className="w-full self-end text-sm sm:w-72">
        {totalRows.map(([label, paise]) => (
          <div key={label} className="flex justify-between py-0.5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="tabular-nums">{formatPaise(paise)}</dd>
          </div>
        ))}
        <div className="mt-1 flex justify-between border-t pt-2 text-base font-semibold">
          <dt>{tx("admin.bills.total")}</dt>
          <dd
            className={cn(
              "tabular-nums",
              bill.cancelled ? "text-muted-foreground line-through" : "text-brand",
            )}
          >
            {formatPaise(bill.totalPaise)}
          </dd>
        </div>
      </dl>
    </div>
  );
}

function LetterheadBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}
