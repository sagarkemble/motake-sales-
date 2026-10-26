import { logger } from "@repo/logger";

// What a checkout tells Spec J (WhatsApp) after its transaction commits. Every figure was captured
// inside the transaction, so the listener never re-derives a Balance.

export interface RouteStamp {
  name: string;
  code: string;
  delivery_state: string;
}

export interface BillIssuedEvent {
  billId: string;
  billVersionId: string;
  versionNumber: 1;
  billNumber: string;
  customerId: string;
  routeId: string;
  route: RouteStamp;
  totalPaise: number;
  // After the Bill debit and before any checkout Payment.
  balanceAfterBillPaise: number;
}

export interface PaymentPostedEvent {
  paymentId: string;
  // J's Receipt ref is payment/{paymentId}/{postedEventId}.
  postedEventId: string;
  paymentNumber: string;
  customerId: string;
  keptPaise: number;
  returnedPaise: number;
  balanceAfterPaise: number;
}

// One outcome per call: Bill then Payment, either may be absent (field Payment has no Bill).
export interface CheckoutOutcome {
  bill: BillIssuedEvent | null;
  payment: PaymentPostedEvent | null;
}

export type CheckoutListener = (outcome: CheckoutOutcome) => void | Promise<void>;

// Until Spec J lands nothing listens.
export const noCheckoutListener: CheckoutListener = () => {};

// Called once, after a first successful commit. A listener error is logged and never fails or
// rolls back the domain call.
export async function notifyAfterCommit(
  listener: CheckoutListener,
  outcome: CheckoutOutcome,
): Promise<void> {
  try {
    await listener(outcome);
  } catch (listenerError) {
    logger.error("Checkout after-commit listener failed", {
      error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      billId: outcome.bill?.billId ?? null,
      paymentId: outcome.payment?.paymentId ?? null,
    });
  }
}
