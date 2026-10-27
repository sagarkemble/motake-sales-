"use client";

import type { RouterOutputs } from "@repo/trpc/client";

import { Badge } from "~/components/ui/badge";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";
import { cn } from "~/lib/utils";

export type CheckoutQuote = RouterOutputs["orders"]["quote"]["data"];

/** The server quote's Bill totals: taxable value, GST, round-off and total with legal type. */
export function QuoteTotals({
  totals,
  isLoading = false,
  compact = false,
}: {
  totals: CheckoutQuote["totals"] | null;
  isLoading?: boolean;
  compact?: boolean;
}) {
  const tx = useTranslate();
  const { formatPaise } = useFormatMoney();
  const rows: [string, number][] = totals
    ? [
        ["checkout.totals.taxable", totals.taxablePaise],
        ["checkout.totals.cgst", totals.cgstPaise],
        ["checkout.totals.sgst", totals.sgstPaise],
        ...(totals.igstPaise > 0
          ? [["checkout.totals.igst", totals.igstPaise] as [string, number]]
          : []),
        ["checkout.totals.roundOff", totals.roundOffPaise],
      ]
    : [];
  const showSkeleton = isLoading || !totals;

  return (
    <div className={cn("flex flex-col gap-1 text-sm", compact && "text-xs")}>
      {showSkeleton
        ? Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))
        : rows.map(([labelKey, paise]) => (
            <div key={labelKey} className="flex justify-between text-muted-foreground">
              <span>{tx(labelKey)}</span>
              <span className="tabular-nums">{formatPaise(paise)}</span>
            </div>
          ))}
      <Separator className="my-1" />
      <div className="flex items-center justify-between gap-2 font-semibold">
        <span className="flex items-center gap-2">
          {tx("checkout.totals.total")}
          {totals && (
            <Badge variant="secondary" className="font-normal">
              {tx(
                totals.legalType === "tax_invoice"
                  ? "checkout.totals.taxInvoice"
                  : "checkout.totals.billOfSupply",
              )}
            </Badge>
          )}
        </span>
        {showSkeleton ? (
          <Skeleton className="h-5 w-20" />
        ) : (
          <span className="tabular-nums text-brand">{formatPaise(totals.totalPaise)}</span>
        )}
      </div>
    </div>
  );
}
