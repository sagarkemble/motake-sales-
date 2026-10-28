import { ledgerRefusal } from "../errors";

// What the Payment and Refund papers (Spec H) share: Admin Add's idempotency and Correct's
// refusals. Each paper keeps its own posting (`postAdjustment`): the Ledger entry type, the id
// it carries and the row it reads differ.

type Paper = "Payment" | "Refund";

// A transaction's result plus what it tells Spec J after commit.
export interface Run<Result, Outcome> {
  result: Result;
  outcome: Outcome;
}

// Rolls back a field Payment or an Admin Add whose key another call already posted.
export class SameKeyAlreadyPosted extends Error {}

export const keyReusedRefusal = (paper: Paper) =>
  ledgerRefusal(
    "idempotency_key_reused",
    `This key was already used for a different ${paper}. Try again.`,
  );

// Someone else corrected this paper after the Admin opened it.
export const staleCorrectRefusal = (paper: Paper) =>
  ledgerRefusal("stale_version", `Someone else corrected this ${paper} first. Reload it.`);

const amountFieldOf: Record<Paper, string> = { Payment: "kept amount", Refund: "amount" };

export const nothingChangedRefusal = (paper: Paper) =>
  ledgerRefusal(
    "nothing_changed",
    `Nothing changed. Change the ${amountFieldOf[paper]}, mode or reference, or close Correct.`,
  );
