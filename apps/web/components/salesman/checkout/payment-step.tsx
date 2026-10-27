"use client";

import { PaymentBlock } from "~/components/shared/checkout/payment-block";
import { Skeleton } from "~/components/ui/skeleton";
import { useTranslate } from "~/hooks/use-translate";
import type { PaymentContext, PaymentDraft } from "~/lib/checkout-payment";

interface PaymentStepProps {
  shopName: string;
  paymentContext: PaymentContext | null;
  paymentDraft: PaymentDraft;
  onPaymentDraftChange: (draft: PaymentDraft) => void;
  isPlacing: boolean;
}

/** Book Now step 4: money taken now against the Bill and the Customer's Balance. */
export function PaymentStep({
  shopName,
  paymentContext,
  paymentDraft,
  onPaymentDraftChange,
  isPlacing,
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
      {paymentContext ? (
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
