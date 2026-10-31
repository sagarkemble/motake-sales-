import { businessDateOf } from "@repo/trpc/client";
import { useState } from "react";

import { amountErrorKey } from "~/components/admin/ledger/money-paper-parts";
import type { CheckoutSuccessInput } from "~/components/shared/checkout/checkout-success";
import { useCheckoutAttempt } from "~/hooks/shared/use-checkout-attempt";
import type { OrderTypeChoice } from "~/hooks/salesman/use-checkout-wizard";
import { useLedger } from "~/hooks/use-ledger";
import { useOrders } from "~/hooks/use-orders";
import {
  EMPTY_PAYMENT_DRAFT,
  paymentMaths,
  paymentProblemKey,
  toCheckoutPaymentInput,
  type PaymentContext,
  type PaymentDraft,
  type PaymentMode,
} from "~/lib/checkout-payment";
import { parseRupeesToPaise } from "~/lib/rupee-input";

export interface AdvanceDraft {
  mode: PaymentMode;
  amountText: string;
  reference: string;
}

const EMPTY_ADVANCE: AdvanceDraft = { mode: "cash", amountText: "", reference: "" };

// Admin New order (variant A stepper): Customer, Book now or Pre-order, items at the Customer's
// Route price, then the checkout Payment (Book now) or an optional advance (Pre-order).
export function useOfficeOrder(initialCustomerId: string | null) {
  const today = businessDateOf(new Date());
  const [customerId, setCustomerIdState] = useState(initialCustomerId);
  const [orderType, setOrderType] = useState<OrderTypeChoice>("book_now");
  const [scheduledDate, setScheduledDate] = useState(today);
  // Pack count per Variety SKU.
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft>(EMPTY_PAYMENT_DRAFT);
  const [advance, setAdvance] = useState<AdvanceDraft>(EMPTY_ADVANCE);
  const [result, setResult] = useState<CheckoutSuccessInput | null>(null);
  const attempt = useCheckoutAttempt("office-order");

  const lines = Object.entries(quantities).map(([sku, qty]) => ({ sku, qty }));
  const {
    summary,
    isSummaryLoading,
    openPreorders,
    catalog,
    isCatalogLoading,
    isCatalogError,
    refetchCatalog,
  } = useLedger({ customerId: customerId ?? undefined, loadCatalog: true, enabled: !result });
  const {
    quote,
    isQuoteFetching,
    quoteError,
    placeOfficeBookNowAsync,
    isPlacingOfficeBookNow,
    placeOfficePreOrderAsync,
    isPlacingOfficePreOrder,
  } = useOrders({
    quoteInput: customerId && lines.length > 0 ? { customerId, lines, orderType } : undefined,
    enabled: !result,
  });

  const inactive = summary?.customer.status === "inactive";
  const paymentContext: PaymentContext | null = quote
    ? {
        billTotalPaise: quote.totals.totalPaise,
        balanceBeforePaise: quote.balance?.balancePaise ?? 0,
      }
    : null;
  const advancePaise = parseRupeesToPaise(advance.amountText.trim()) ?? 0;
  const advanceErrorKey = amountErrorKey(advance.amountText, false);
  // One key per Customer, type and basket, so a retry only ever replays the same order.
  const attemptId = `office:${customerId}:${orderType}:${scheduledDate}:${JSON.stringify(lines)}`;

  // A new Customer keeps the basket; lines with no price on their Route are flagged by the quote.
  function setCustomerId(nextCustomerId: string) {
    setCustomerIdState(nextCustomerId);
    setPaymentDraft(EMPTY_PAYMENT_DRAFT);
    setAdvance(EMPTY_ADVANCE);
  }

  function setQty(sku: string, qty: number) {
    setQuantities((current) => {
      const next = { ...current };
      if (qty <= 0) delete next[sku];
      else next[sku] = qty;
      return next;
    });
  }

  async function placeBookNow(context: PaymentContext) {
    if (!customerId || !summary) return;
    const previewReturnedPaise = paymentMaths(context, paymentDraft).preview.returnedPaise;
    const billed = await attempt.run(
      async (idempotencyKey) =>
        (
          await placeOfficeBookNowAsync({
            customerId,
            lines,
            idempotencyKey,
            payment: toCheckoutPaymentInput(context, paymentDraft),
          })
        ).data,
      { paymentContext: context, fallbackErrorKey: "admin.orders.new.placeFailed", attemptId },
    );
    if (billed) {
      setResult({
        kind: "billed",
        headingKey: "checkout.success.billed",
        shopName: summary.customer.shopName,
        mode: paymentDraft.mode,
        result: billed,
        previewReturnedPaise,
      });
    }
  }

  async function placePreOrder() {
    if (!customerId || !summary || !quote) return;
    const placed = await attempt.run(
      async (idempotencyKey) =>
        (
          await placeOfficePreOrderAsync({
            customerId,
            scheduledDate,
            lines,
            idempotencyKey,
            advance:
              advancePaise > 0
                ? {
                    mode: advance.mode,
                    keptPaise: advancePaise,
                    reference:
                      advance.mode === "cash" ? undefined : advance.reference.trim() || undefined,
                  }
                : undefined,
          })
        ).data,
      { paymentContext: null, fallbackErrorKey: "admin.orders.new.placeFailed", attemptId },
    );
    if (placed) {
      setResult({
        kind: "preorder",
        shopName: summary.customer.shopName,
        totalQuantity: quote.totals.totalQuantity,
        result: placed,
      });
    }
  }

  async function place() {
    if (orderType === "pre_order") await placePreOrder();
    else if (paymentContext) await placeBookNow(paymentContext);
  }

  // balance_changed: retry against the Balance the server found, under a new key.
  async function placeAgain() {
    const change = attempt.balanceChange;
    if (!change) return;
    await placeBookNow({ ...change.wasContext, balanceBeforePaise: change.nowBalancePaise });
  }

  function reset() {
    attempt.reset();
    setCustomerIdState(null);
    setOrderType("book_now");
    setScheduledDate(today);
    setQuantities({});
    setPaymentDraft(EMPTY_PAYMENT_DRAFT);
    setAdvance(EMPTY_ADVANCE);
    setResult(null);
  }

  // The locale key of what blocks the checkout button, or null.
  const checkoutProblemKey =
    orderType === "pre_order"
      ? advanceErrorKey
      : paymentContext
        ? paymentProblemKey(paymentContext, paymentDraft)
        : null;

  return {
    today,
    customerId,
    setCustomerId,
    summary,
    isSummaryLoading,
    inactive,
    openPreorders,
    orderType,
    setOrderType,
    scheduledDate,
    setScheduledDate,
    catalog,
    isCatalogLoading,
    isCatalogError,
    refetchCatalog,
    quantities,
    setQty,
    lines,
    quote,
    isQuoteFetching,
    quoteError,
    paymentContext,
    paymentDraft,
    setPaymentDraft,
    advance,
    setAdvance,
    advanceErrorKey,
    checkoutProblemKey,
    isPlacing: isPlacingOfficeBookNow || isPlacingOfficePreOrder,
    refusal: attempt.refusal,
    clearRefusal: attempt.clearRefusal,
    balanceChange: attempt.balanceChange,
    changePayment: attempt.clearBalanceChange,
    place,
    placeAgain,
    result,
    reset,
  };
}

export type OfficeOrder = ReturnType<typeof useOfficeOrder>;
