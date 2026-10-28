import { db } from "@repo/database";
import { getBillGstFacts, lockFilingMonth, type BillGstFacts } from "@repo/database/queries/gst";
import type { DbExecutor } from "@repo/database/queries/shared/executor";

import { internalError } from "../errors";
import type { BillLockAction, BillLockDecision, BillLockHook } from "./bill-events";

// The GST gates (Spec I, #43): Filed month and IRN recorded, decided from one read of the Bill.
// The Bill paper shows them through GstService.getBillGstState; Spec G's Correct and Cancel ask
// the same rule through gstBillLockHook. One rule, not two.

export type GstAction =
  | "lineCorrect"
  | "cancel"
  | "portalCancel"
  | "enterIrn"
  | "correctIrn"
  | "raiseNote"
  | "draft";

export type IrnStatus = "not_needed" | "pending" | "recorded" | "portal_cancelled";

export interface GstGates {
  allowed: Record<GstAction, boolean>;
  // Why each refused action is refused, naming the next step; null when allowed.
  refusalReasons: Record<GstAction, string | null>;
}

// First day of the Bill-date month.
export function periodMonthOf(billDate: string): string {
  return `${billDate.slice(0, 7)}-01`;
}

const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// `2026-10-…` → `Oct 2026`.
export function monthLabelOf(date: string): string {
  return `${MONTH_NAMES[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

export function irnStatusOf(facts: BillGstFacts): IrnStatus {
  if (facts.portalCancelAckNumber) return "portal_cancelled";
  if (facts.irn) return "recorded";
  if (facts.irnPending) return "pending";
  return "not_needed";
}

type GateDecision = { reason: string; message: string } | null;

// Spec I's table: cancelled closes everything; a Filed month closes line Correct, Cancel and
// portal cancellation (Raise Note instead); an IRN closes line Correct and plain Cancel. A
// deactivated Customer allows reads only, so it closes the IRN writes and portal cancellation
// last, after the Bill's own gates (as Spec G checks the Customer after its lock hook).
function decide(facts: BillGstFacts, action: GstAction): GateDecision {
  const gate = decideBillGate(facts, action);
  if (gate || facts.customerActive || !CUSTOMER_WRITES.includes(action)) return gate;
  return {
    reason: "customer_inactive",
    message: `${facts.customerShopName ?? "The Customer"} is inactive`,
  };
}

// The GST writes on a Bill that a deactivated Customer refuses (Spec G refuses its own).
const CUSTOMER_WRITES: GstAction[] = ["enterIrn", "correctIrn", "portalCancel"];

function decideBillGate(facts: BillGstFacts, action: GstAction): GateDecision {
  const bill = `Bill ${facts.number}`;
  if (facts.cancelled) return { reason: "bill_cancelled", message: `${bill} is cancelled.` };
  const filed = {
    reason: "month_filed",
    message: `${bill} is in a filed GSTR-1 month (${monthLabelOf(facts.billDate)}). Raise Note instead.`,
  };
  switch (action) {
    case "lineCorrect":
      if (facts.filedMonth) return filed;
      if (facts.irn) {
        return {
          reason: "irn_recorded",
          message: `${bill} has an IRN on the e-invoice portal. Raise Note instead.`,
        };
      }
      return null;
    case "cancel":
      if (facts.filedMonth) return filed;
      if (facts.irn) {
        return {
          reason: "irn_recorded",
          message: `${bill} has an IRN. Cancel it on the e-invoice portal and record the portal cancellation, or Raise Note.`,
        };
      }
      return null;
    case "portalCancel":
      if (facts.filedMonth) return filed;
      if (!facts.irn) {
        return { reason: "irn_missing", message: `${bill} has no IRN. Use Cancel.` };
      }
      return null;
    case "enterIrn":
      if (facts.irn) {
        return {
          reason: "irn_already_recorded",
          message: "IRN already recorded — use Correct IRN.",
        };
      }
      if (facts.legalType !== "tax_invoice") {
        return {
          reason: "bill_of_supply",
          message: `${bill} is a Bill of Supply; it needs no IRN.`,
        };
      }
      if (!facts.einvoicingApplies) {
        return {
          reason: "einvoicing_not_required",
          message: `E-invoicing is not required for this Customer; ${bill} needs no IRN.`,
        };
      }
      return null;
    case "correctIrn":
      if (!facts.irn) {
        return { reason: "irn_missing", message: `${bill} has no IRN. Use Enter IRN.` };
      }
      return null;
    case "raiseNote":
      return null;
    case "draft":
      if (!facts.irnPending) {
        return {
          reason: "irn_not_pending",
          message: `${bill} is not waiting for an IRN; download its PDF instead.`,
        };
      }
      return null;
  }
}

const ACTIONS: GstAction[] = [
  "lineCorrect",
  "cancel",
  "portalCancel",
  "enterIrn",
  "correctIrn",
  "raiseNote",
  "draft",
];

export function gstGatesOf(facts: BillGstFacts): GstGates {
  const decisions = ACTIONS.map((action) => [action, decide(facts, action)] as const);
  return {
    allowed: Object.fromEntries(
      decisions.map(([action, gate]) => [action, gate === null]),
    ) as Record<GstAction, boolean>,
    refusalReasons: Object.fromEntries(
      decisions.map(([action, gate]) => [action, gate?.message ?? null]),
    ) as Record<GstAction, string | null>,
  };
}

// The gate for one action as a lock decision (for Spec G's hook and Spec I's own writes).
export function gstDecisionOf(facts: BillGstFacts, action: GstAction): BillLockDecision {
  const gate = decide(facts, action);
  return gate ? { allowed: false, ...gate } : { allowed: true };
}

const lockActionToGstAction: Record<BillLockAction, GstAction> = {
  correct: "lineCorrect",
  cancel: "cancel",
  portal_cancel: "portalCancel",
};

// Reads the Bill's GST facts; inside a transaction it first takes the shared lock on the Bill's
// month, so the read sees any filing that committed before it.
export async function readBillGstFacts(
  billId: string,
  billDate: string,
  executor: DbExecutor = db,
): Promise<BillGstFacts> {
  if (executor !== db) await lockFilingMonth(periodMonthOf(billDate), "shared", executor);
  const facts = await getBillGstFacts(billId, executor);
  if (!facts) throw internalError(`Bill ${billId} has no GST facts`);
  return facts;
}

// Spec G's lock hook: called inside Correct and Cancel right after the bills row lock. Cancelled
// and a deactivated Customer stay G's own refusals, so only the month and IRN gates decide here.
export const gstBillLockHook: BillLockHook = async ({ bill, action }, executor) => {
  const facts = await readBillGstFacts(bill.id, bill.billDate, executor);
  return gstDecisionOf(
    { ...facts, cancelled: false, customerActive: true },
    lockActionToGstAction[action],
  );
};
