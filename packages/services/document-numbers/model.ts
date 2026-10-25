import type { DocumentKind } from "@repo/database/queries/document-number-series";
import { z } from "zod";

import { financialYearSchema } from "../shared/financial-year";

// Also the lock order: a transaction that needs several numbers allocates them in this order.
export const DOCUMENT_KINDS = [
  "bill",
  "credit_note",
  "debit_note",
  "payment",
  "refund",
] as const satisfies readonly DocumentKind[];

export const DEFAULT_PREFIXES: Record<DocumentKind, string> = {
  bill: "MB",
  credit_note: "MC",
  debit_note: "MD",
  payment: "MP",
  refund: "MR",
};

export const financialYearInputSchema = z.object({
  financialYear: financialYearSchema,
  actorId: z.string().uuid(),
});
export type FinancialYearInput = z.input<typeof financialYearInputSchema>;

export const allocateInputSchema = financialYearInputSchema.extend({
  kind: z.enum(DOCUMENT_KINDS),
});
export type AllocateInput = z.input<typeof allocateInputSchema>;

export const getSeriesInputSchema = financialYearSchema;
export type GetSeriesInput = z.input<typeof getSeriesInputSchema>;

export interface AllocatedNumber {
  number: string;
  prefix: string;
  seq: number;
  financialYear: string;
}

export interface SeriesEntry {
  kind: DocumentKind;
  prefix: string;
  nextSeq: number;
  firstUsedAt: Date | null;
  frozen: boolean;
  saved: boolean;
}
