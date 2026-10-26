import type { SelectVarietyTaxPeriod } from "@repo/database/schema";
import { z } from "zod";

// An Asia/Kolkata calendar day, YYYY-MM-DD.
const daySchema = z.iso.date();
const varietyIdsSchema = z.array(z.string().uuid());

export const varietyIdSchema = z.string().uuid();
export const periodIdSchema = z.string().uuid();

// Exempt with a rate, and taxable at 0%, are refused by the service with a readable message.
export const upsertTaxPeriodInputSchema = z.object({
  varietyId: z.string().uuid(),
  effectiveFrom: daySchema,
  hsn: z.string().regex(/^[0-9]{4,8}$/, "HSN must be 4 to 8 digits"),
  exempt: z.boolean(),
  // 5% is 500.
  gstRateBps: z.number().int().min(0),
});
export type UpsertTaxPeriodInput = z.input<typeof upsertTaxPeriodInputSchema>;

export const currentForVarietiesInputSchema = varietyIdsSchema;
export type CurrentForVarietiesInput = z.input<typeof currentForVarietiesInputSchema>;

export const coveringTaxFactsInputSchema = z.object({
  varietyIds: varietyIdsSchema,
  day: daySchema,
});
export type CoveringTaxFactsInput = z.input<typeof coveringTaxFactsInputSchema>;

// What a sale snapshots onto its lines.
export interface TaxFacts {
  periodId: string;
  effectiveFrom: string;
  hsn: string;
  exempt: boolean;
  gstRateBps: number;
}

export interface FinancialYearWindow {
  financialYear: string;
  firstDay: string;
  lastDay: string;
}

export interface TaxPeriodView extends SelectVarietyTaxPeriod {
  coversToday: boolean;
  // Starts after today.
  upcoming: boolean;
  // Starts in the current financial year, so Admin may edit or delete it.
  editable: boolean;
}

export interface TaxPeriodList {
  today: string;
  currentFinancialYear: FinancialYearWindow;
  periods: TaxPeriodView[];
}

export interface CurrentTax {
  varietyId: string;
  period: TaxFacts | null;
}

export interface UpsertTaxPeriodResult {
  period: SelectVarietyTaxPeriod;
  outcome: "created" | "overwritten";
}

export interface DeleteTaxPeriodResult {
  deleted: SelectVarietyTaxPeriod;
  // What covers today for that Variety after the delete.
  coveringToday: TaxFacts | null;
}
