"use client";

import { PaymentBlock } from "~/components/shared/checkout/payment-block";
import { RefusalAlert } from "~/components/shared/checkout/refusal-alert";
import { Button } from "~/components/ui/button";
import { Skeleton } from "~/components/ui/skeleton";
import { useTranslate } from "~/hooks/use-translate";
import type { PaymentContext, PaymentDraft } from "~/lib/checkout-payment";
import type { CheckoutRefusal } from "~/lib/checkout-refusal";

interface PaymentStepProps {
  shopName: string;
  paymentContext: PaymentContext | null;
  paymentDraft: PaymentDraft;
  onPaymentDraftChange: (draft: PaymentDraft) => void;
  isPlacing: boolean;
  // The quote behind the amounts: refused (e.g. the Customer left the Route) or failed.
  quoteRefusal: CheckoutRefusal | null;
  hasQuoteError: boolean;
  onRetryQuote: () => void;
  onQuoteRefusalAction: (refusal: CheckoutRefusal) => void;
}

/** Book Now step 4: money taken now against the Bill and the Customer's Balance. */
export function PaymentStep({
  shopName,
  paymentContext,
  paymentDraft,
  onPaymentDraftChange,
  isPlacing,
  quoteRefusal,
  hasQuoteError,
  onRetryQuote,
  onQuoteRefusalAction,
}: PaymentStepProps) {
  const tx = useTranslate();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-base font-semibold">{tx("checkout.payment.title")}</p>
        <p className="text-sm text-muted-foreground">
          {tx("checkout.payment.hint", { shop: shopName })}
        </p>
      </div>
      {quoteRefusal ? (
        <RefusalAlert
          refusal={quoteRefusal}
          shopName={shopName}
          onAction={() => onQuoteRefusalAction(quoteRefusal)}
        />
      ) : hasQuoteError ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border p-6 text-center">
          <p className="text-sm text-muted-foreground">{tx("checkout.payment.loadFailed")}</p>
          <Button type="button" variant="outline" onClick={onRetryQuote}>
            {tx("common.actions.tryAgain")}
          </Button>
        </div>
      ) : paymentContext ? (
        <PaymentBlock
          context={paymentContext}
          draft={paymentDraft}
          onChange={onPaymentDraftChange}
          disabled={isPlacing}
        />
      ) : (
        <Skeleton className="h-72 rounded-2xl" />
      )}
    </div>
  );
}
