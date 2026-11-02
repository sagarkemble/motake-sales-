"use client";

import { LockIcon } from "lucide-react";

import { BalanceChangedDialog } from "~/components/shared/checkout/balance-changed-dialog";
import { BalanceChip } from "~/components/shared/checkout/balance-text";
import { PaymentBlock } from "~/components/shared/checkout/payment-block";
import { QuoteTotals } from "~/components/shared/checkout/quote-totals";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { GstRate } from "~/components/shared/gst-rate";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import type { FulfilPreOrderState } from "~/hooks/shared/use-fulfil-pre-order";
import { useFormatDate } from "~/hooks/use-format-date";
import { useFormatMoney } from "~/hooks/use-format-money";
import { useTranslate } from "~/hooks/use-translate";

interface LockedLinesProps {
  state: FulfilPreOrderState;
  shopName: string;
  scheduledDate: string;
  placedAt: Date | null;
}

/** A Pre-order's lines and totals from the price and GST locked at place. */
export function LockedLines({ state, shopName, scheduledDate, placedAt }: LockedLinesProps) {
  const tx = useTranslate();
  const formatDate = useFormatDate();
  const { formatPaise } = useFormatMoney();

  if (state.quoteRefusal) {
    return <RefusalAlert refusal={state.quoteRefusal} shopName={shopName} />;
  }
  if (state.quoteError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
        <p className="text-sm text-muted-foreground">{tx("checkout.fulfil.loadFailed")}</p>
        <Button
          type="button"
          variant="outline"
          className="rounded-full"
          onClick={() => state.refetchQuote()}
        >
          {tx("common.actions.tryAgain")}
        </Button>
      </div>
    );
  }
  if (state.isQuoteLoading || !state.quote) {
    return <Skeleton className="h-48 rounded-2xl" />;
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {placedAt && (
          <Badge variant="outline" className="gap-1 font-normal">
            <LockIcon className="size-3" />
            {tx("checkout.fulfil.lockedOn", { date: formatDate(placedAt, "d MMM") })}
          </Badge>
        )}
        <span>
          {tx("checkout.fulfil.forDate", { date: formatDate(scheduledDate, "EEE, d MMM yyyy") })}
        </span>
        {state.quote.balance && <BalanceChip balancePaise={state.quote.balance.balancePaise} />}
      </div>
      <div className="flex flex-col divide-y rounded-2xl border bg-card shadow-sm">
        {state.quote.lines.map((line) => (
          <div key={line.sku} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{line.name}</p>
              <p className="text-muted-foreground">
                {line.qty} {line.unit} × {formatPaise(line.routePricePaise)} · GST{" "}
                <GstRate gstRateBps={line.gstRateBps} exempt={line.exempt} />
              </p>
            </div>
            <span className="shrink-0 tabular-nums">{formatPaise(line.taxablePaise)}</span>
          </div>
        ))}
        <div className="px-3 py-3">
          <QuoteTotals totals={state.quote.totals} compact />
        </div>
      </div>
    </div>
  );
}

/** The refusal, the Payment block and the balance_changed dialog of a fulfil. */
export function FulfilPayment({
  state,
  shopName,
}: {
  state: FulfilPreOrderState;
  shopName: string;
}) {
  if (!state.paymentContext) return null;
  return (
    <div className="flex flex-col gap-3">
      {state.refusal && (
        <RefusalAlert refusal={state.refusal} shopName={shopName} onDismiss={state.clearRefusal} />
      )}
      <PaymentBlock
        context={state.paymentContext}
        draft={state.paymentDraft}
        onChange={state.setPaymentDraft}
        disabled={state.isFulfilling}
      />
      <BalanceChangedDialog
        wasContext={state.balanceChange?.wasContext ?? null}
        nowBalancePaise={state.balanceChange?.nowBalancePaise ?? null}
        draft={state.paymentDraft}
        shopName={shopName}
        isPlacing={state.isFulfilling}
        onChangePayment={state.changePayment}
        onPlaceAgain={() => void state.placeAgain()}
      />
    </div>
  );
}
