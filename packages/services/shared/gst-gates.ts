import { db } from "@repo/database";
import { getBillGstFacts, lockFilingMonth, type BillGstFacts } from "@repo/database/queries/gst";
import type { DbExecutor } from "@repo/database/queries/shared/executor";

import { internalError } from "../errors";
import type { BillLockAction, BillLockDecision, BillLockHook } from "./bill-events";

// The GST gates (Spec I, #43): Filed month, decided from one read of the Bill. The Bill paper
// shows them through GstService.getBillGstState; Spec G's Correct and Cancel ask the same rule
// through gstBillLockHook. One rule, not two.

export type GstAction = "lineCorrect" | "cancel" | "raiseNote";

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

type GateDecision = { reason: string; message: string } | null;

// Spec I's table: cancelled closes everything; a Filed month closes line Correct and Cancel
// (Raise Note instead).
function decide(facts: BillGstFacts, action: GstAction): GateDecision {
  const bill = `Bill ${facts.number}`;
  if (facts.cancelled) return { reason: "bill_cancelled", message: `${bill} is cancelled.` };
  switch (action) {
    case "lineCorrect":
    case "cancel":
      if (facts.filedMonth) {
        return {
          reason: "month_filed",
          message: `${bill} is in a filed GSTR-1 month (${monthLabelOf(facts.billDate)}). Raise Note instead.`,
        };
      }
      return null;
    case "raiseNote":
      return null;
  }
}

const ACTIONS: GstAction[] = ["lineCorrect", "cancel", "raiseNote"];

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

// The gate for one action as a lock decision (for Spec G's hook).
export function gstDecisionOf(facts: BillGstFacts, action: GstAction): BillLockDecision {
  const gate = decide(facts, action);
  return gate ? { allowed: false, ...gate } : { allowed: true };
}

const lockActionToGstAction: Record<BillLockAction, GstAction> = {
  correct: "lineCorrect",
  cancel: "cancel",
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
// stays G's own refusal, so only the month gate decides here.
export const gstBillLockHook: BillLockHook = async ({ bill, action }, executor) => {
  const facts = await readBillGstFacts(bill.id, bill.billDate, executor);
  return gstDecisionOf({ ...facts, cancelled: false }, lockActionToGstAction[action]);
};
