import { isCalendarDate } from "@repo/services/gst";

import { z } from "../../schema";

// GSTR-1 month lock (Spec I). Money in paise; dates `YYYY-MM-DD`; month `YYYY-MM`.

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date as YYYY-MM-DD")
  .refine(isCalendarDate, "Use a real calendar date");
const reasonSchema = z.string().trim().min(1, "A reason is required").max(1000);
const notesSchema = z.string().trim().max(1000);
const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Pick the month as YYYY-MM");
const requiredText = (label: string, max?: number) => {
  const text = z.string().trim().min(1, `${label} is required`);
  return max ? text.max(max, `${label} is at most ${max} characters`) : text;
};

const filingFieldsSchema = z.object({
  filedOn: businessDateSchema,
  reference: requiredText("The GSTR-1 reference", 128),
  notes: notesSchema.nullable().optional(),
});

export const previewGstr1FilingInputSchema = z.object({ month: monthSchema });

// The filer is the signed-in Admin, never input.
export const recordGstr1FilingInputSchema = filingFieldsSchema.extend({ month: monthSchema });

// Month and filer never change; notes left out stay, blank clears them.
export const correctGstr1FilingInputSchema = filingFieldsSchema.extend({
  filingId: z.string().uuid(),
  reason: reasonSchema,
});

export const billIdInputSchema = z.object({ billId: z.string().uuid() });

export const gstr1FilingSchema = z.object({
  id: z.string(),
  // First day of the month, `YYYY-MM-01`.
  periodMonth: z.string(),
  filedOn: z.string(),
  reference: z.string(),
  filerId: z.string(),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const gstr1FilingListRowSchema = gstr1FilingSchema.extend({
  filerName: z.string().nullable(),
});

export const gstr1FilingPreviewSchema = z.object({
  month: z.string(),
  alreadyFiled: z.boolean(),
  billsDatedInMonth: z.number().int(),
});

export const recordGstr1FilingResultSchema = z.object({
  filing: gstr1FilingSchema,
});

const gstActionsSchema = <T extends z.ZodType>(value: T) =>
  z.object({
    lineCorrect: value,
    cancel: value,
    raiseNote: value,
  });

export const billGstStateSchema = z.object({
  billId: z.string(),
  billNumber: z.string(),
  month: z.string(),
  filedMonth: z.boolean(),
  cancelled: z.boolean(),
  allowed: gstActionsSchema(z.boolean()),
  // The refusal message for each action that is off; null when allowed.
  refusalReasons: gstActionsSchema(z.string().nullable()),
});
