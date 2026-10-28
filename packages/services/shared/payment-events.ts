import { logger } from "@repo/logger";
import type { SelectPayment } from "@repo/database/schema";

// What an Admin Payment or Refund procedure (Spec H) tells Spec J (WhatsApp) after its transaction
// commits. Every outcome carries the Customer, the Admin's reason and the Balance after posting,
// captured inside the transaction, so the listener never re-reads a Balance. Refusals and
// idempotent retries emit nothing.

type PaymentMode = SelectPayment["mode"];

interface OutcomeCommon {
  customerId: string;
  reason: string;
  balanceAfterPaise: number;
}

export interface PaymentAddedOutcome extends OutcomeCommon {
  kind: "payment_added";
  paymentId: string;
  // J's Receipt ref is payment/{paymentId}/{postedEventId}.
  postedEventId: string;
  paymentNumber: string;
  mode: PaymentMode;
  keptPaise: number;
  // Always 0: an office Payment hands nothing back.
  returnedPaise: number;
}

export interface PaymentCorrectedOutcome extends OutcomeCommon {
  kind: "payment_corrected";
  paymentId: string;
  adjustedEventId: string;
  paymentNumber: string;
  keptBeforePaise: number;
  keptAfterPaise: number;
  // Kept after − kept before.
  differencePaise: number;
  keptChanged: boolean;
  mode: PaymentMode;
  reference: string | null;
}

export interface RefundAddedOutcome extends OutcomeCommon {
  kind: "refund_added";
  refundId: string;
  postedEventId: string;
  refundNumber: string;
  mode: PaymentMode;
  amountPaise: number;
}

export interface RefundCorrectedOutcome extends OutcomeCommon {
  kind: "refund_corrected";
  refundId: string;
  adjustedEventId: string;
  refundNumber: string;
  amountBeforePaise: number;
  amountAfterPaise: number;
  // Amount after − amount before.
  differencePaise: number;
  amountChanged: boolean;
  mode: PaymentMode;
  reference: string | null;
}

export type AdminPaymentOutcome =
  | PaymentAddedOutcome
  | PaymentCorrectedOutcome
  | RefundAddedOutcome
  | RefundCorrectedOutcome;

export type AdminPaymentListener = (outcome: AdminPaymentOutcome) => void | Promise<void>;

// Until Spec J lands nothing listens.
export const noAdminPaymentListener: AdminPaymentListener = () => {};

// Called once, after a first successful commit. A listener error is logged and never fails or
// rolls back the domain call.
export async function notifyAdminPaymentOutcome(
  listener: AdminPaymentListener,
  outcome: AdminPaymentOutcome,
): Promise<void> {
  try {
    await listener(outcome);
  } catch (listenerError) {
    logger.error("Admin Payment after-commit listener failed", {
      error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      kind: outcome.kind,
      customerId: outcome.customerId,
    });
  }
}
