import { db } from "@repo/database";
import { getGstCreditNoteDeadlineRow } from "@repo/database/queries/gst-credit-note-deadlines";
import type { DbExecutor } from "@repo/database/queries/shared/executor";

import { financialYearBounds, financialYearOf } from "../shared/financial-year";
import {
  getDeadlineInputSchema,
  isGstCreditNoteAllowedInputSchema,
  type GetDeadlineInput,
  type GstCreditNoteDeadline,
  type IsGstCreditNoteAllowedInput,
} from "./model";

// Last day a GST Credit Note may be issued against Bills of a financial year. Debit Notes have no
// deadline and never ask.
class GstCreditNoteDeadlineService {
  // Configured row, else 30 November of the calendar year the FY ends in. Never inserts a row.
  public async getDeadline(
    input: GetDeadlineInput,
    executor: DbExecutor = db,
  ): Promise<GstCreditNoteDeadline> {
    const financialYear = getDeadlineInputSchema.parse(input);
    const configured = await getGstCreditNoteDeadlineRow(financialYear, executor);
    if (configured) return { deadlineDate: configured.deadlineDate, source: "configured" };
    const endYear = financialYearBounds(financialYear).lastDay.slice(0, 4);
    return { deadlineDate: `${endYear}-11-30`, source: "default" };
  }

  // The deadline day itself is allowed.
  public async isGstCreditNoteAllowed(
    input: IsGstCreditNoteAllowedInput,
    executor: DbExecutor = db,
  ): Promise<GstCreditNoteDeadline & { allowed: boolean }> {
    const parsedInput = isGstCreditNoteAllowedInputSchema.parse(input);
    const deadline = await this.getDeadline(financialYearOf(parsedInput.billDate), executor);
    return { allowed: parsedInput.onDate <= deadline.deadlineDate, ...deadline };
  }
}

export default GstCreditNoteDeadlineService;
export type { GstCreditNoteDeadline };
