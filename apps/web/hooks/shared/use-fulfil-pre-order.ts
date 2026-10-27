import { useState } from "react";

import type { CheckoutSuccessInput } from "~/components/shared/checkout/checkout-success";
import { useCheckoutAttempt } from "~/hooks/shared/use-checkout-attempt";
import { useOrders } from "~/hooks/use-orders";
import {
  EMPTY_PAYMENT_DRAFT,
  paymentMaths,
  paymentProblemKey,
  toCheckoutPaymentInput,
  type PaymentContext,
  type PaymentDraft,
} from "~/lib/checkout-payment";
import { checkoutRefusalOf } from "~/lib/checkout-refusal";

// One Pre-order fulfil (salesman or Admin): the quote from the terms locked at place, the Payment
// block and orders.fulfilPreOrder with its own idempotency key.
export function useFulfilPreOrder({ orderId, shopName }: { orderId: string; shopName: string }) {
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const [result, setResult] = useState<CheckoutSuccessInput | null>(null);
  const attempt = useCheckoutAttempt(`fulfil:${orderId}`);

  const { quote, isQuoteLoading, quoteError, refetchQuote, fulfillOrderAsync, isFulfillingOrder } =
    useOrders({
      quoteInput: { orderId, lines: [], orderType: "pre_order" },
      enabled: !result,
    });

  const paymentContext: PaymentContext | null = quote
    ? {
        billTotalPaise: quote.totals.totalPaise,
        balanceBeforePaise: quote.balance?.balancePaise ?? 0,
      }
    : null;
  const quoteRefusal = quoteError ? checkoutRefusalOf(quoteError) : null;
  const problemKey = paymentContext ? paymentProblemKey(paymentContext, paymentDraft) : null;

  async function submit(context: PaymentContext) {
    const previewReturnedPaise = paymentMaths(context, paymentDraft).preview.returnedPaise;
    const billed = await attempt.run(
      async (idempotencyKey) =>
        (
          await fulfillOrderAsync({
            id: orderId,
            idempotencyKey,
            payment: toCheckoutPaymentInput(context, paymentDraft),
          })
        ).data,
      { paymentContext: context, fallbackErrorKey: "checkout.fulfil.failed" },
    );
    if (billed) {
      setResult({
        kind: "billed",
        headingKey: "checkout.success.fulfilled",
        shopName,
        mode: paymentDraft.mode,
        result: billed,
        previewReturnedPaise,
      });
    }
  }

  async function fulfil() {
    if (paymentContext) await submit(paymentContext);
  }

  // balance_changed: retry against the Balance the server found, under a new key.
  async function placeAgain() {
    const change = attempt.balanceChange;
    if (!change) return;
    await submit({ ...change.wasContext, balanceBeforePaise: change.nowBalancePaise });
    void refetchQuote();
  }

  function changePayment() {
    attempt.clearBalanceChange();
    void refetchQuote();
  }

  return {
    quote,
    isQuoteLoading,
    quoteRefusal,
    quoteError,
    refetchQuote,
    paymentContext,
    paymentDraft,
    setPaymentDraft,
    problemKey,
    isFulfilling: isFulfillingOrder,
    refusal: attempt.refusal,
    clearRefusal: attempt.clearRefusal,
    balanceChange: attempt.balanceChange,
    fulfil,
    placeAgain,
    changePayment,
    result,
  };
}

export type FulfilPreOrderState = ReturnType<typeof useFulfilPreOrder>;
