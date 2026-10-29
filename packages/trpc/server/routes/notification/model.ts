import { z } from "../../schema";

const notificationKindSchema = z.enum([
  "bill",
  "receipt",
  "credit_note",
  "debit_note",
  "account_update",
  "cancellation",
]);
const notificationStatusSchema = z.enum(["pending", "delivered", "read", "failed", "skipped"]);
const notificationProviderSchema = z.enum(["whatsapp", "sms"]);
const messageLanguageSchema = z.enum(["mr", "hi", "en"]);
const failureCategorySchema = z.enum([
  "invalid_recipient",
  "window_closed",
  "template_error",
  "media_error",
  "auth_error",
  "payment_error",
  "opted_out_or_blocked",
  "rate_limited",
  "provider_unavailable",
  "ambiguous",
  "unknown",
]);

export const enqueueInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  kind: notificationKindSchema,
  to: z.string().nullable(),
  skipReason: z.string().min(1).max(500).optional(),
  provider: notificationProviderSchema,
  templateId: z.string().min(1).max(128),
  language: messageLanguageSchema,
  values: z.record(z.string(), z.string()),
  attachment: z
    .object({
      key: z.string().min(1).max(1024),
      type: z.enum(["pdf", "image"]),
      filename: z.string().min(1).max(255),
    })
    .optional(),
  businessRef: z.string().min(1).max(128),
});

export const enqueueResultSchema = z.object({
  notificationId: z.string(),
  status: notificationStatusSchema,
  skipReason: z.string().nullable(),
  created: z.boolean(),
});

export const notificationIdInputSchema = z.object({ notificationId: z.string().uuid() });

export const notificationStatusViewSchema = z.object({
  notificationId: z.string(),
  kind: notificationKindSchema,
  businessRef: z.string(),
  idempotencyKey: z.string(),
  status: notificationStatusSchema,
  skipReason: z.string().nullable(),
  attemptCount: z.number().int(),
  lastAttemptAt: z.date().nullable(),
  failureCategory: failureCategorySchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const listByBusinessRefsInputSchema = z.object({
  businessRefs: z.array(z.string().min(1).max(128)).min(1).max(200),
});

export const resendInputSchema = z.object({
  notificationId: z.string().uuid(),
  to: z.string().optional(),
});

export const resendResultSchema = z.object({
  notificationId: z.string(),
  status: notificationStatusSchema,
});

export const suppressInputSchema = z.object({
  notificationId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const suppressResultSchema = z.union([
  z.object({ suppressed: z.literal(true) }),
  z.object({ suppressed: z.literal(false), status: notificationStatusSchema }),
]);

const whatsAppTokenStateSchema = z.enum(["ok", "invalid", "unavailable"]);

export const healthSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  database: z.enum(["ok", "down"]),
  inngest: z.enum(["ok", "down"]),
  whatsappToken: whatsAppTokenStateSchema,
});

export const whatsAppTokenStatusSchema = z.object({
  state: whatsAppTokenStateSchema,
  checkedAt: z.date().nullable(),
  heldCount: z.number().int(),
  tokenHeldCount: z.number().int(),
  paymentHeldCount: z.number().int(),
  pausedReason: z.enum(["token", "payment"]).nullable(),
  lastWorkedAt: z.date().nullable(),
});

export const resumeHeldResultSchema = z.object({ queued: z.number().int() });

export const listTemplatesInputSchema = z.object({
  provider: notificationProviderSchema.optional(),
  templateId: z.string().min(1).max(128).optional(),
  language: messageLanguageSchema.optional(),
});

export const resolveTemplateInputSchema = z.object({
  provider: notificationProviderSchema,
  templateId: z.string().min(1).max(128),
  language: messageLanguageSchema,
});

export const notificationTemplateSchema = z.object({
  id: z.string(),
  provider: notificationProviderSchema,
  templateId: z.string(),
  language: messageLanguageSchema,
  version: z.number().int(),
  templateVariables: z.array(z.string()),
  documentType: z.enum(["none", "image", "pdf"]),
  verified: z.boolean(),
  createdAt: z.date(),
});
