import { z } from "../../schema";

const financialYearSchema = z.string().regex(/^\d{2}-\d{2}$/);
const reasonSchema = z.string().max(500).optional();
const documentKindSchema = z.enum(["bill", "credit_note", "debit_note", "payment", "refund"]);

export const sellerSettingsSchema = z.object({
  id: z.string(),
  legalName: z.string(),
  address: z.string(),
  state: z.string(),
  gstin: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  einvoicingRequired: z.boolean(),
  updatedBy: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const sellerSetupDefaultsSchema = z.object({
  legalName: z.string(),
  address: z.string(),
  state: z.string(),
  gstin: z.string(),
  phone: z.string(),
  email: z.string(),
});

const sellerFieldsSchema = z.object({
  legalName: z.string().min(1).max(200),
  address: z.string().min(1),
  state: z.string().min(1).max(120),
  gstin: z.string().max(20),
  phone: z.string().min(1).max(20),
  email: z.string().max(255).nullable().optional(),
});

export const setUpSellerSettingsInputSchema = sellerFieldsSchema.extend({ reason: reasonSchema });

export const updateSellerSettingsInputSchema = sellerFieldsSchema
  .partial()
  .extend({ reason: reasonSchema });

export const settingsHistoryEntrySchema = z.object({
  id: z.string(),
  action: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  reason: z.string().nullable(),
  payload: z.unknown(),
  createdAt: z.date(),
});

export const numberSeriesEntrySchema = z.object({
  id: z.string().nullable(),
  kind: documentKindSchema,
  prefix: z.string(),
  saved: z.boolean(),
  nextSeq: z.number().int(),
  firstUsedAt: z.date().nullable(),
  editable: z.boolean(),
  nextNumberPreview: z.string(),
});

export const financialYearInputSchema = z.object({ financialYear: financialYearSchema });

export const updatePrefixInputSchema = z.object({
  financialYear: financialYearSchema,
  kind: documentKindSchema,
  prefix: z.string().min(1).max(10),
  reason: reasonSchema,
});

export const prepareYearInputSchema = financialYearInputSchema.extend({ reason: reasonSchema });

export const seriesIdInputSchema = z.object({ seriesId: z.string().uuid() });

export const creditNoteDeadlineEntrySchema = z.object({
  financialYear: z.string(),
  deadlineDate: z.string(),
  source: z.enum(["configured", "default"]),
});

// Spec J-0. Never the token.
export const whatsAppTokenSettingsSchema = z.object({
  state: z.enum(["ok", "invalid", "unavailable", "unknown"]),
  pausedReason: z.enum(["token", "payment"]).nullable(),
  heldCount: z.number().int().nullable(),
  lastWorkedAt: z.date().nullable(),
});

export const updateWhatsAppTokenInputSchema = z.object({
  token: z.string().trim().min(1).max(2048),
});

export const sendWaitingResultSchema = z.object({ queued: z.number().int() });

export const setCreditNoteDeadlineInputSchema = z.object({
  financialYear: financialYearSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reason: reasonSchema,
});
