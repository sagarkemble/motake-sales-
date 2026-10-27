import type { RouterInputs } from "@repo/trpc/client";

import { keepRupeeInputCharacters, parseRupeesToPaise } from "~/lib/rupee-input";

// The checkout Payment block (Book Now, fulfil, field Payment). The maths mirror
// packages/services/payments/overpay.ts so the preview matches what the server keeps.

export type PaymentMode = "cash" | "bank" | "upi";
export type OverpayChoice = "return_change" | "keep_advance";
export type BalanceState = "pending" | "advance" | "settled";

export const PAYMENT_MODES: PaymentMode[] = ["cash", "bank", "upi"];

export interface PaymentDraft {
  mode: PaymentMode;
  receivedText: string;
  reference: string;
  overpay: OverpayChoice | null;
}

export const EMPTY_PAYMENT_DRAFT: PaymentDraft = {
  mode: "cash",
  receivedText: "",
  reference: "",
  overpay: null,
};

export interface PaymentContext {
  // Null for a field Payment (no Bill).
  billTotalPaise: number | null;
  // Customer Balance before this Bill: positive is Pending, negative is Advance.
  balanceBeforePaise: number;
}

export interface PaymentPreview {
  receivedPaise: number;
  keptPaise: number;
  returnedPaise: number;
  // Cash above what clears Pending with no choice made yet: the server would refuse it.
  needsOverpayChoice: boolean;
  // Cash above what clears Pending: the return-or-Advance question is shown.
  isOverpay: boolean;
  balanceAfterPaise: number;
}

export function balanceStateOf(balancePaise: number): { state: BalanceState; amountPaise: number } {
  if (balancePaise > 0) return { state: "pending", amountPaise: balancePaise };
  if (balancePaise < 0) return { state: "advance", amountPaise: -balancePaise };
  return { state: "settled", amountPaise: 0 };
}

// The field keeps digits and one "." only, so "500." and ".5" are mid-typing forms of 500 and 0.50,
// not ₹0. Empty or zero is ₹0.
export function receivedPaiseOf(receivedText: string): number {
  const typedText = receivedText.trim().replace(/\.$/, "").replace(/^\./, "0.");
  return parseRupeesToPaise(typedText) ?? 0;
}

export function cleanReceivedText(rawInput: string): string {
  return keepRupeeInputCharacters(rawInput);
}

// requiredPaise is what clears Pending: max(0, Balance after the Bill) at checkout, max(0, current
// Balance) for a field Payment.
export function paymentMaths(context: PaymentContext, draft: PaymentDraft) {
  const balanceAfterBillPaise = context.balanceBeforePaise + (context.billTotalPaise ?? 0);
  const requiredPaise = Math.max(0, balanceAfterBillPaise);
  const receivedPaise = receivedPaiseOf(draft.receivedText);
  const isOverpay = draft.mode === "cash" && receivedPaise > requiredPaise;
  // A field Payment with nothing Pending keeps everything or nothing: returning change keeps ₹0,
  // which the server refuses (field_payment_kept_zero), so that choice is not offered.
  const canReturnChange = !(context.billTotalPaise === null && requiredPaise === 0);
  let keptPaise = receivedPaise;
  let returnedPaise = 0;
  let needsOverpayChoice = false;
  if (isOverpay && draft.overpay !== "keep_advance") {
    keptPaise = requiredPaise;
    returnedPaise = receivedPaise - requiredPaise;
    needsOverpayChoice = draft.overpay !== "return_change";
  }
  const preview: PaymentPreview = {
    receivedPaise,
    keptPaise,
    returnedPaise,
    needsOverpayChoice,
    isOverpay,
    balanceAfterPaise: balanceAfterBillPaise - keptPaise,
  };
  return { balanceAfterBillPaise, requiredPaise, canReturnChange, preview };
}

// The locale key of what blocks the primary button, or null.
export function paymentProblemKey(context: PaymentContext, draft: PaymentDraft): string | null {
  const { preview, canReturnChange } = paymentMaths(context, draft);
  if (preview.needsOverpayChoice)
    return canReturnChange
      ? "checkout.payment.problem.chooseOverpay"
      : "checkout.payment.problem.keepAsAdvance";
  if (context.billTotalPaise === null && preview.keptPaise <= 0)
    return "checkout.payment.problem.enterAmount";
  return null;
}

export type CheckoutPaymentInput = RouterInputs["orders"]["placeBookNow"]["payment"];

// What the server takes: the overpay choice only when cash is above what clears Pending.
export function toCheckoutPaymentInput(
  context: PaymentContext,
  draft: PaymentDraft,
): CheckoutPaymentInput {
  const { preview } = paymentMaths(context, draft);
  const reference = draft.mode === "cash" ? "" : draft.reference.trim();
  return {
    mode: draft.mode,
    receivedPaise: preview.receivedPaise,
    reference: reference || undefined,
    overpay: preview.isOverpay && draft.overpay ? draft.overpay : undefined,
  };
}
