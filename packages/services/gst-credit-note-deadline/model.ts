import { z } from "zod";

import { financialYearSchema } from "../shared/financial-year";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const getDeadlineInputSchema = financialYearSchema;
export type GetDeadlineInput = z.input<typeof getDeadlineInputSchema>;

// `billDate` picks the financial year; `onDate` is the Note's IST issue date.
export const isGstCreditNoteAllowedInputSchema = z.object({
  billDate: businessDateSchema,
  onDate: businessDateSchema,
});
export type IsGstCreditNoteAllowedInput = z.input<typeof isGstCreditNoteAllowedInputSchema>;

export interface GstCreditNoteDeadline {
  deadlineDate: string;
  source: "configured" | "default";
}
