"use client";

import type { RouterOutputs } from "@repo/trpc/client";

import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { billTaxRows } from "~/lib/bill-tax-rows";
import { cn } from "~/lib/utils";

type OrderBill = NonNullable<RouterOutputs["bills"]["getForOrder"]["data"]>;

interface OrderBillLinesProps {
  bill: OrderBill;
}

/** The current Bill's lines and totals, as issued. */
export function OrderBillLines({ bill }: OrderBillLinesProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  const totalRows: { labelKey: string; paise: number }[] = [
    { labelKey: "salesman.orders.bill.taxableValue", paise: bill.taxablePaise },
    ...billTaxRows(bill).map(({ tax, paise }) => ({
      labelKey: `salesman.orders.bill.${tax}`,
      paise,
    })),
    { labelKey: "salesman.orders.bill.roundOff", paise: bill.roundOffPaise },
  ];

  return (
    <div className="overflow-hidden rounded-xl border text-xs">
      <div className="flex items-center justify-between gap-2 bg-muted/40 px-3 py-2">
        <p className="font-medium">
          {tx(
            bill.legalType === "tax_invoice"
              ? "salesman.orders.bill.taxInvoice"
              : "salesman.orders.bill.billOfSupply",
          )}
        </p>
        <p className="text-muted-foreground">
          {tx("salesman.orders.bill.billDate", {
            date: formatDate(new Date(bill.billDate), "d MMM yyyy"),
          })}
        </p>
      </div>

      <table className="w-full">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-1.5 text-left font-medium">{tx("salesman.orders.bill.item")}</th>
            <th className="px-1 py-1.5 text-right font-medium">
              {tx("salesman.orders.bill.taxable")}
            </th>
            <th className="px-3 py-1.5 text-right font-medium">{tx("salesman.orders.bill.gst")}</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((line) => (
            <tr key={line.id} className="border-b last:border-b-0">
              <td className="px-3 py-1.5 align-top">
                <p className="font-medium">{line.stamp.name}</p>
                <p className="text-muted-foreground">
                  {line.quantity} {line.stamp.unit} × {formatPaise(line.routePricePaise)}
                </p>
              </td>
              <td className="px-1 py-1.5 text-right align-top tabular-nums">
                {formatPaise(line.taxablePaise)}
              </td>
              <td className="px-3 py-1.5 text-right align-top tabular-nums">
                {line.exempt
                  ? tx("salesman.orders.bill.exempt")
                  : formatPaise(line.cgstPaise + line.sgstPaise + line.igstPaise)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="space-y-1 border-t bg-muted/20 px-3 py-2">
        {totalRows.map(({ labelKey, paise }) => (
          <div key={labelKey} className="flex justify-between text-muted-foreground">
            <span>{tx(labelKey)}</span>
            <span className="tabular-nums">{formatPaise(paise)}</span>
          </div>
        ))}
        <div className="flex justify-between pt-1 text-sm font-semibold">
          <span>{tx("salesman.orders.bill.total")}</span>
          <span className={cn("tabular-nums", bill.cancelled ? "line-through" : "text-brand")}>
            {formatPaise(bill.totalPaise)}
          </span>
        </div>
      </div>
    </div>
  );
}
