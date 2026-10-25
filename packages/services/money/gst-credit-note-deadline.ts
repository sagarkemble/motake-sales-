import { getGstCreditNoteDeadlineRow } from "@repo/database/queries/money/gst-credit-note-deadlines";
import type { DbExecutor } from "@repo/database/queries/shared/executor";

import { financialYearBounds, financialYearOf } from "./financial-year";

export interface GstCreditNoteDeadline {
  deadlineDate: string;
  source: "configured" | "default";
}

// Last day a GST Credit Note may be issued against Bills of a financial year. Debit Notes have no
// deadline and never ask.
export class GstCreditNoteDeadlineService {
  // Configured row, else 30 November of the calendar year the FY ends in. Never inserts a row.
  public async getDeadline(
    financialYear: string,
    executor?: DbExecutor,
  ): Promise<GstCreditNoteDeadline> {
    const configured = await getGstCreditNoteDeadlineRow(financialYear, executor);
    if (configured) return { deadlineDate: configured.deadlineDate, source: "configured" };
    const endYear = financialYearBounds(financialYear).lastDay.slice(0, 4);
    return { deadlineDate: `${endYear}-11-30`, source: "default" };
  }

  // Uses the Bill's FY; `onDate` is the Note's IST issue date. The deadline day itself is allowed.
  public async isGstCreditNoteAllowed(
    input: { billDate: string; onDate: string },
    executor?: DbExecutor,
  ): Promise<GstCreditNoteDeadline & { allowed: boolean }> {
    const deadline = await this.getDeadline(financialYearOf(input.billDate), executor);
    return { allowed: input.onDate <= deadline.deadlineDate, ...deadline };
  }
}
