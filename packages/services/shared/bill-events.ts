import { logger } from "@repo/logger";
import type { DbExecutor } from "@repo/database/queries/shared/executor";
import type { SelectBill, SelectNote } from "@repo/database/schema";

// What an Admin Bill procedure (Spec G) tells Spec J (WhatsApp) after its transaction commits.
// Every outcome carries the Customer, the Admin's reason and the Balance after posting, captured
// inside the transaction, so the listener never re-reads a Balance. Opening balance emits nothing.

export interface NoteOutcome {
  noteId: string;
  number: string;
  kind: SelectNote["kind"];
  amountPaise: number;
}

interface OutcomeCommon {
  customerId: string;
  reason: string;
  balanceAfterPaise: number;
}

export interface BillRaisedOutcome extends OutcomeCommon {
  kind: "bill_raised";
  billId: string;
  billNumber: string;
  billVersionId: string;
  versionNumber: 1;
  totalPaise: number;
}

export interface BillCorrectedOutcome extends OutcomeCommon {
  kind: "bill_corrected";
  billId: string;
  billNumber: string;
  billVersionId: string;
  versionNumber: number;
  notes: NoteOutcome[];
  balanceChanged: boolean;
  // New Bill total − old Bill total.
  netDifferencePaise: number;
}

export interface BillCancelledOutcome extends OutcomeCommon {
  kind: "bill_cancelled";
  billId: string;
  billNumber: string;
  creditNote: NoteOutcome;
}

export interface PreOrderCancelledOutcome extends OutcomeCommon {
  kind: "pre_order_cancelled";
  orderId: string;
}

export interface NoteRaisedOutcome extends OutcomeCommon {
  kind: "note_raised";
  billId: string;
  billNumber: string;
  note: NoteOutcome;
  // Signed Balance change: + for a Debit Note, − for a Credit Note.
  differencePaise: number;
}

export type AdminBillOutcome =
  | BillRaisedOutcome
  | BillCorrectedOutcome
  | BillCancelledOutcome
  | PreOrderCancelledOutcome
  | NoteRaisedOutcome;

export type AdminBillListener = (outcome: AdminBillOutcome) => void | Promise<void>;

// Until Spec J lands nothing listens.
export const noAdminBillListener: AdminBillListener = () => {};

// Called once, after a successful commit. A listener error is logged and never fails or rolls back
// the domain call.
export async function notifyAdminBillOutcome(
  listener: AdminBillListener,
  outcome: AdminBillOutcome,
): Promise<void> {
  try {
    await listener(outcome);
  } catch (listenerError) {
    logger.error("Admin Bill after-commit listener failed", {
      error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      kind: outcome.kind,
      customerId: outcome.customerId,
    });
  }
}

// --- Lock hook (for Spec I): asked inside Correct and Cancel right after the bills row lock.

export type BillLockAction = "correct" | "cancel";

export type BillLockDecision =
  | { allowed: true }
  | { allowed: false; reason: string; message: string };

// May take locks of its own in the caller's transaction (Spec I takes a shared month lock). The
// Bill paper read asks it outside a transaction to show why Correct and Cancel are off.
export type BillLockHook = (
  input: { bill: SelectBill; action: BillLockAction },
  executor: DbExecutor,
) => Promise<BillLockDecision>;

// Spec I's gstBillLockHook (shared/gst-gates) is AdminBillService's default.
