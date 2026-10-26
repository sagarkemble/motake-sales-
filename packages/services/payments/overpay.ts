import type { SelectPayment } from "@repo/database/schema";

import { checkoutRefusal } from "../errors";

export type PaymentMode = SelectPayment["mode"];
export type OverpayChoice = "return_change" | "keep_advance";

export interface PaymentSplit {
  receivedPaise: number;
  keptPaise: number;
  returnedPaise: number;
}

// Overpay rules for checkout and field Payment. Pure; called before number allocation and again
// with the Balance read under the Customer lock. `requiredPaise` is what clears Pending: max(0,
// Balance after the Bill debit) at checkout, max(0, current Balance) for a field Payment.
export function splitPayment(input: {
  mode: PaymentMode;
  receivedPaise: number;
  overpay?: OverpayChoice;
  requiredPaise: number;
}): PaymentSplit {
  const { mode, receivedPaise, overpay } = input;
  const requiredPaise = Math.max(0, input.requiredPaise);
  if (mode !== "cash") {
    // Bank or UPI money cannot be handed back; Pending clears first and the rest is Advance.
    if (overpay === "return_change") {
      throw checkoutRefusal(
        "return_change_cash_only",
        "Change can be returned only on cash. Bank and UPI extra is kept as Advance.",
      );
    }
    return { receivedPaise, keptPaise: receivedPaise, returnedPaise: 0 };
  }
  if (receivedPaise <= requiredPaise) return { receivedPaise, keptPaise: receivedPaise, returnedPaise: 0 };
  if (overpay === "return_change") {
    return {
      receivedPaise,
      keptPaise: requiredPaise,
      returnedPaise: receivedPaise - requiredPaise,
    };
  }
  if (overpay === "keep_advance") return { receivedPaise, keptPaise: receivedPaise, returnedPaise: 0 };
  throw checkoutRefusal(
    "overpay_choice_required",
    "Cash is more than needed to clear Pending. Choose return change or keep as Advance.",
    { requiredPaise, receivedPaise },
  );
}
