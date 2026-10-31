import type { Gstr1FilingRow } from "@repo/database/queries/gst";
import type { SelectGstr1Filing } from "@repo/database/schema";
import { z } from "zod";

import type { GstGates } from "../shared/gst-gates";

// A real day of the calendar: `2026-02-30` matches the pattern but is no date.
export function isCalendarDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD")
  .refine(isCalendarDate, "Use a real calendar date");
const reasonSchema = z.string().trim().min(1, "A reason is required").max(1000);
const notesSchema = z.string().trim().max(1000);

// `YYYY-MM`; stored as the first day of that month.
export const filingMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick the month as YYYY-MM");

const filingFieldsSchema = z.object({
  filedOn: businessDateSchema,
  reference: z
    .string()
    .trim()
    .min(1, "The GSTR-1 reference is required")
    .max(128, "The reference is at most 128 characters"),
  notes: notesSchema.nullable().optional(),
});

export const previewGstr1FilingInputSchema = z.object({ month: filingMonthSchema });
export type PreviewGstr1FilingInput = z.input<typeof previewGstr1FilingInputSchema>;

// The filer is always the signed-in Admin, never input.
export const recordGstr1FilingInputSchema = filingFieldsSchema.extend({
  month: filingMonthSchema,
});
export type RecordGstr1FilingInput = z.input<typeof recordGstr1FilingInputSchema>;

// Month and filer never change. Notes left out stay as they are; blank or null clears them.
export const correctGstr1FilingInputSchema = filingFieldsSchema.extend({
  filingId: z.string().uuid(),
  reason: reasonSchema,
});
export type CorrectGstr1FilingInput = z.input<typeof correctGstr1FilingInputSchema>;

export interface Gstr1FilingPreview {
  // `YYYY-MM`.
  month: string;
  alreadyFiled: boolean;
  billsDatedInMonth: number;
}

export interface RecordGstr1FilingResult {
  filing: SelectGstr1Filing;
}

export type Gstr1FilingListRow = Gstr1FilingRow;

export const billIdInputSchema = z.object({ billId: z.string().uuid() });
export type BillIdInput = z.input<typeof billIdInputSchema>;

// --- Bill GST state (the Bill paper's GST block and every gate).

export interface BillGstState extends GstGates {
  billId: string;
  billNumber: string;
  // `YYYY-MM` of the Bill date.
  month: string;
  filedMonth: boolean;
  cancelled: boolean;
}
