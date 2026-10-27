import { useState } from "react";
import { toast } from "sonner";

import { useIdempotencyKeys } from "~/hooks/shared/use-idempotency-keys";
import { useTranslate } from "~/hooks/use-translate";
import type { PaymentContext } from "~/lib/checkout-payment";
import { checkoutRefusalOf, type CheckoutRefusal } from "~/lib/checkout-refusal";
import { getErrorMessage } from "~/lib/get-error-message";

export interface BalanceChange {
  // What the Payment step showed, and the Balance the server found under the Customer lock.
  wasContext: PaymentContext;
  nowBalancePaise: number;
}

// One checkout write (Book Now, Pre-order, fulfil, field Payment) with its idempotency key, its
// refusal and the balance_changed re-quote. A refused call writes nothing, so its key is kept for
// the next try, except after balance_changed (the retry is a new attempt with a new key) and
// idempotency_key_reused.
export function useCheckoutAttempt(attemptId: string) {
  const tx = useTranslate();
  const { keyFor, clearKey } = useIdempotencyKeys();
  const [refusal, setRefusal] = useState<CheckoutRefusal | null>(null);
  const [balanceChange, setBalanceChange] = useState<BalanceChange | null>(null);

  async function run<TResult>(
    submit: (idempotencyKey: string) => Promise<TResult>,
    options: { paymentContext: PaymentContext | null; fallbackErrorKey: string },
  ): Promise<TResult | null> {
    setRefusal(null);
    try {
      const result = await submit(keyFor(attemptId));
      clearKey(attemptId);
      setBalanceChange(null);
      return result;
    } catch (attemptError) {
      const checkoutRefusal = checkoutRefusalOf(attemptError);
      if (!checkoutRefusal) {
        toast.error(getErrorMessage(attemptError, tx(options.fallbackErrorKey)));
        return null;
      }
      const nowBalancePaise = checkoutRefusal.details.balancePaise;
      if (
        checkoutRefusal.reason === "balance_changed" &&
        options.paymentContext &&
        typeof nowBalancePaise === "number"
      ) {
        clearKey(attemptId);
        setBalanceChange({ wasContext: options.paymentContext, nowBalancePaise });
        return null;
      }
      if (
        checkoutRefusal.reason === "balance_changed" ||
        checkoutRefusal.reason === "idempotency_key_reused"
      ) {
        clearKey(attemptId);
      }
      setBalanceChange(null);
      setRefusal(checkoutRefusal);
      return null;
    }
  }

  function reset() {
    clearKey(attemptId);
    setRefusal(null);
    setBalanceChange(null);
  }

  return {
    run,
    refusal,
    clearRefusal: () => setRefusal(null),
    balanceChange,
    clearBalanceChange: () => setBalanceChange(null),
    reset,
  };
}
