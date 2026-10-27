import { logger } from "@repo/logger";

// What Enter IRN and Correct IRN (Spec I) tell Spec J after their transaction commits: J draws the
// final Bill PDF (or replaces it after Correct IRN) and releases the withheld Bill WhatsApp.
// Portal cancellation tells Spec G's listener instead (a Bill cancelled outcome).

interface IrnOutcomeCommon {
  billId: string;
  billNumber: string;
  customerId: string;
  // Latest Bill version: the one J draws the PDF for.
  versionNumber: number;
  // J's Bill ref depends on it; Correct IRN always moves it.
  irnRecordedAt: Date;
}

export interface IrnRecordedOutcome extends IrnOutcomeCommon {
  kind: "irn_recorded";
}

export interface IrnCorrectedOutcome extends IrnOutcomeCommon {
  kind: "irn_corrected";
  reason: string;
}

export type GstOutcome = IrnRecordedOutcome | IrnCorrectedOutcome;

export type GstListener = (outcome: GstOutcome) => void | Promise<void>;

// Until Spec J lands nothing listens.
export const noGstListener: GstListener = () => {};

// Called once, after a successful commit; never on a refusal or an idempotent retry. A listener
// error is logged and never fails or rolls back the domain call.
export async function notifyGstOutcome(listener: GstListener, outcome: GstOutcome): Promise<void> {
  try {
    await listener(outcome);
  } catch (listenerError) {
    logger.error("GST after-commit listener failed", {
      error: listenerError instanceof Error ? listenerError.message : String(listenerError),
      kind: outcome.kind,
      billId: outcome.billId,
    });
  }
}
