import { useState } from "react";

import type { CheckoutSuccessInput } from "~/components/shared/checkout/checkout-success";
import { useCheckoutAttempt } from "~/hooks/shared/use-checkout-attempt";
import { usePayments } from "~/hooks/use-payments";
import {
  EMPTY_PAYMENT_DRAFT,
  paymentMaths,
  paymentProblemKey,
  toCheckoutPaymentInput,
  type PaymentContext,
  type PaymentDraft,
} from "~/lib/checkout-payment";

// One field Payment (money with no purchase) from a Customer on the Active GatePass Route.
export function useRecordFieldPayment(
  customer: { id: string; shopName: string; balancePaise: number } | null,
) {
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const [result, setResult] = useState<CheckoutSuccessInput | null>(null);
  const attempt = useCheckoutAttempt(`field-payment:${customer?.id ?? ""}`);
  const { recordFieldPaymentAsync, isRecordingFieldPayment } = usePayments();

  const paymentContext: PaymentContext | null = customer
    ? { billTotalPaise: null, balanceBeforePaise: customer.balancePaise }
    : null;
  const problemKey = paymentContext ? paymentProblemKey(paymentContext, paymentDraft) : null;

  async function record() {
    if (!customer || !paymentContext) return;
    const previewReturnedPaise = paymentMaths(paymentContext, paymentDraft).preview.returnedPaise;
    const recorded = await attempt.run(
      async (idempotencyKey) =>
        (
          await recordFieldPaymentAsync({
            customerId: customer.id,
            idempotencyKey,
            ...toCheckoutPaymentInput(paymentContext, paymentDraft),
          })
        ).data,
      { paymentContext: null, fallbackErrorKey: "salesman.customers.recordFailed" },
    );
    if (recorded) {
      setResult({
        kind: "field",
        shopName: customer.shopName,
        mode: paymentDraft.mode,
        result: recorded,
        previewReturnedPaise,
      });
    }
  }

  return {
    paymentContext,
    paymentDraft,
    setPaymentDraft,
    problemKey,
    isRecording: isRecordingFieldPayment,
    refusal: attempt.refusal,
    clearRefusal: attempt.clearRefusal,
    record,
    result,
  };
}
