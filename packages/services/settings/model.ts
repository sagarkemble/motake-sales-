import type { DocumentKind } from "@repo/database/queries/document-number-series";
import type { SettingsHistoryEntry } from "@repo/database/queries/settings";
import { z } from "zod";

import { DOCUMENT_KINDS } from "../document-numbers/model";
import { financialYearSchema } from "../shared/financial-year";
import { INDIAN_STATES } from "../shared/indian-states";

// 2-digit state code, PAN (5 letters, 4 digits, 1 letter), entity number, Z, check character.
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

// Five letters, four digits, one letter; a seller PAN is also characters 3–12 of its GSTIN.
export const PAN_PATTERN = /^[A-Z]{5}\d{4}[A-Z]$/;

// Four letters (the bank), a zero, six letters or digits (the branch).
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const reasonSchema = z.string().trim().max(500).optional();

function blankAsNull(value: string): string | null {
  return value === "" ? null : value;
}

function optionalText(maxLength: number) {
  return z.string().trim().max(maxLength).transform(blankAsNull).nullable().optional();
}

// Trimmed and upper-cased, then checked; blank clears it.
function optionalUpperCode(pattern: RegExp, message: string) {
  return z
    .string()
    .trim()
    .toUpperCase()
    .refine((value) => value === "" || pattern.test(value), message)
    .transform(blankAsNull)
    .nullable()
    .optional();
}

const sellerFieldsSchema = z.object({
  legalName: z.string().trim().min(1).max(200),
  address: z.string().trim().min(1),
  // Stored exactly as the shared list spells it, so the GST place-of-supply test can match strings.
  state: z
    .string()
    .refine(
      (name) => INDIAN_STATES.some((state) => state.name === name),
      "Not an Indian state or union territory",
    ),
  // Trimmed and upper-cased like Customer GSTIN, then checked.
  gstin: z.string().trim().toUpperCase().length(15).regex(GSTIN_PATTERN, "Not a valid GSTIN"),
  // Same rule as Customer phone.
  phone: z.string().min(1).max(20),
  email: z.string().trim().email().max(255).nullable().optional(),
  // Printed on Documents only. A blank value saves as null, which clears the field.
  pan: optionalUpperCode(PAN_PATTERN, "Not a valid PAN"),
  bankAccountName: optionalText(200),
  bankName: optionalText(120),
  bankBranch: optionalText(120),
  bankAccountNumber: z
    .string()
    .trim()
    .regex(/^(\d{6,34})?$/, "An account number is 6 to 34 digits")
    .transform(blankAsNull)
    .nullable()
    .optional(),
  bankIfsc: optionalUpperCode(IFSC_PATTERN, "Not a valid IFSC"),
  // One term per line; blank lines and the spaces around each line are dropped.
  terms: z
    .string()
    .max(2000)
    .transform((terms) =>
      blankAsNull(
        terms
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .join("\n"),
      ),
    )
    .nullable()
    .optional(),
  place: optionalText(120),
});

// No einvoicingRequired: the seller-level flag stays at its default (true) and is not editable here.
export const setUpSellerSettingsInputSchema = sellerFieldsSchema;
export type SetUpSellerSettingsInput = z.input<typeof setUpSellerSettingsInputSchema>;

export const updateSellerSettingsInputSchema = sellerFieldsSchema.partial();
export type UpdateSellerSettingsInput = z.input<typeof updateSellerSettingsInputSchema>;

export const listNumberSeriesInputSchema = financialYearSchema;
export type ListNumberSeriesInput = z.input<typeof listNumberSeriesInputSchema>;

// 1–2 letters fits `prefix varchar(2)`; `mb ` saves as `MB`.
export const documentPrefixSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{1,2}$/, "A prefix is 1 or 2 letters A–Z");

export const updatePrefixInputSchema = z.object({
  financialYear: financialYearSchema,
  kind: z.enum(DOCUMENT_KINDS),
  prefix: documentPrefixSchema,
  reason: reasonSchema,
});
export type UpdatePrefixInput = z.input<typeof updatePrefixInputSchema>;

export const prepareFinancialYearInputSchema = z.object({
  financialYear: financialYearSchema,
  reason: reasonSchema,
});
export type PrepareFinancialYearInput = z.input<typeof prepareFinancialYearInputSchema>;

export const seriesIdSchema = z.string().uuid();

export const setCreditNoteDeadlineInputSchema = z.object({
  financialYear: financialYearSchema,
  date: z.iso.date(),
  reason: reasonSchema,
});
export type SetCreditNoteDeadlineInput = z.input<typeof setCreditNoteDeadlineInputSchema>;

export const creditNoteDeadlineYearSchema = financialYearSchema;

export interface SellerSetupDefaults {
  legalName: string;
  address: string;
  state: string;
  gstin: string;
  phone: string;
  email: string;
}

export interface NumberSeriesEntry {
  // Null while the series has no saved row (its prefix is then the default).
  id: string | null;
  kind: DocumentKind;
  prefix: string;
  saved: boolean;
  nextSeq: number;
  firstUsedAt: Date | null;
  editable: boolean;
  nextNumberPreview: string;
}

export interface CreditNoteDeadlineEntry {
  financialYear: string;
  deadlineDate: string;
  source: "configured" | "default";
}

export type { SettingsHistoryEntry };
