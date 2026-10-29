import { z } from "zod";

export const notificationKindSchema = z.enum([
  "bill",
  "receipt",
  "credit_note",
  "debit_note",
  "account_update",
  "cancellation",
]);
export const notificationProviderSchema = z.enum(["whatsapp", "sms"]);
export const messageLanguageSchema = z.enum(["mr", "hi", "en"]);
export const attachmentTypeSchema = z.enum(["pdf", "image"]);

export const notificationIdSchema = z.string().uuid();

export const attachmentSchema = z.object({
  // Private R2 object key of the Document (Spec L).
  key: z.string().min(1).max(1024),
  type: attachmentTypeSchema,
  filename: z.string().min(1).max(255),
});
export type NotificationAttachment = z.infer<typeof attachmentSchema>;

// The provider-neutral instruction the main API hands over after its domain transaction commits.
export const enqueueInputSchema = z.object({
  idempotencyKey: z.string().min(1).max(128),
  kind: notificationKindSchema,
  // Normalized by the caller (`+91…`); null or malformed saves the row as skipped.
  to: z.string().nullable(),
  // Used only when `to` is null.
  skipReason: z.string().min(1).max(500).optional(),
  provider: notificationProviderSchema,
  templateId: z.string().min(1).max(128),
  language: messageLanguageSchema,
  // Template values by blank name.
  values: z.record(z.string(), z.string()),
  attachment: attachmentSchema.optional(),
  // Opaque Bill / Payment / Note reference; no FK.
  businessRef: z.string().min(1).max(128),
});
export type EnqueueInput = z.input<typeof enqueueInputSchema>;

export const listByBusinessRefsInputSchema = z.object({
  businessRefs: z.array(z.string().min(1).max(128)).min(1).max(200),
});
export type ListByBusinessRefsInput = z.input<typeof listByBusinessRefsInputSchema>;

export const resendInputSchema = z.object({
  notificationId: notificationIdSchema,
  // The Customer's current phone; replaces the stored one.
  to: z.string().optional(),
});
export type ResendInput = z.input<typeof resendInputSchema>;

export const suppressInputSchema = z.object({
  notificationId: notificationIdSchema,
  reason: z.string().min(1).max(500),
});
export type SuppressInput = z.input<typeof suppressInputSchema>;

export const listTemplatesInputSchema = z.object({
  provider: notificationProviderSchema.optional(),
  templateId: z.string().min(1).max(128).optional(),
  language: messageLanguageSchema.optional(),
});
export type ListTemplatesInput = z.input<typeof listTemplatesInputSchema>;

export const resolveTemplateInputSchema = z.object({
  provider: notificationProviderSchema,
  templateId: z.string().min(1).max(128),
  language: messageLanguageSchema,
});
export type ResolveTemplateInput = z.input<typeof resolveTemplateInputSchema>;

export const sendAttemptOptionsSchema = z.object({
  // 0 for the first try.
  tryIndex: z.number().int().min(0),
  isFinalTry: z.boolean(),
});
export type SendAttemptOptions = z.input<typeof sendAttemptOptionsSchema>;

// The send function's failure handler: the run it gave up on (its Inngest event id).
export const failRunInputSchema = z.object({
  notificationId: notificationIdSchema,
  runKey: z.string().min(1).max(200),
  error: z.string().max(2000),
});
export type FailRunInput = z.input<typeof failRunInputSchema>;

export const providerStatusUpdateSchema = z.object({
  providerMessageId: z.string().min(1).max(128),
  status: z.enum(["sent", "delivered", "read", "failed", "other"]),
  timestamp: z.string(),
  // `<category>: <message> (meta code <n>)` for a failed status.
  error: z.string().nullable(),
});
export type ProviderStatusUpdate = z.infer<typeof providerStatusUpdateSchema>;

export type NotificationKind = z.infer<typeof notificationKindSchema>;
export type NotificationStatus = "pending" | "delivered" | "read" | "failed" | "skipped";

// Codes in the error data of a refused enqueue or resend.
export type { NotificationRefusalReason } from "../errors";

export const failureCategories = [
  "invalid_recipient",
  "window_closed",
  "template_error",
  "media_error",
  "auth_error",
  // The WhatsApp account has a payment problem (Meta 131042); held like auth_error (Spec J-0).
  "payment_error",
  "opted_out_or_blocked",
  "rate_limited",
  "provider_unavailable",
  "ambiguous",
  "unknown",
] as const;
export type FailureCategory = (typeof failureCategories)[number];

export interface EnqueueResult {
  notificationId: string;
  status: NotificationStatus;
  skipReason: string | null;
  created: boolean;
}

// What callers see; never the provider message id, raw error, phone, values or attachment key.
export interface NotificationStatusView {
  notificationId: string;
  kind: NotificationKind;
  businessRef: string;
  idempotencyKey: string;
  status: NotificationStatus;
  skipReason: string | null;
  attemptCount: number;
  lastAttemptAt: Date | null;
  failureCategory: FailureCategory | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ResendResult {
  notificationId: string;
  status: NotificationStatus;
}

export type SuppressResult =
  | { suppressed: true }
  | { suppressed: false; status: NotificationStatus };

export interface NotificationTemplateView {
  id: string;
  provider: "whatsapp" | "sms";
  templateId: string;
  language: "mr" | "hi" | "en";
  version: number;
  templateVariables: string[];
  documentType: "none" | "image" | "pdf";
  verified: boolean;
  createdAt: Date;
}

// `held`: the provider refused the access token (`auth_error`) or the WhatsApp account has a
// payment problem (`payment_error`); the row stays pending with the failed attempt and no further
// try runs until it is resumed (Spec J-0).
export type SendAttemptOutcome = "noop" | "sent" | "retry" | "terminal" | "failed" | "held";

export interface SendAttemptResult {
  outcome: SendAttemptOutcome;
  failureCategory: FailureCategory | null;
}

export interface FailRunResult {
  failed: boolean;
  status: NotificationStatus | null;
}

export interface ApplyStatusResult {
  applied: boolean;
  status: NotificationStatus | null;
}

// The working WhatsApp access token at the last check (Spec J-0): `ok`, refused by the provider
// (`invalid`), or not checkable (provider or Vault unreachable, or never checked yet).
export type WhatsAppTokenState = "ok" | "invalid" | "unavailable";

// Why WhatsApp messages are paused, for the Admin banner: the token is refused (`token`), or
// messages are held on a WhatsApp account payment problem (`payment`).
export type WhatsAppPausedReason = "token" | "payment";

export interface WhatsAppTokenStatus {
  state: WhatsAppTokenState;
  checkedAt: Date | null;
  // Pending rows held on a token error plus those held on a payment problem.
  heldCount: number;
  tokenHeldCount: number;
  paymentHeldCount: number;
  // `token` while the token is invalid; otherwise `payment` while any row is held on a payment
  // problem; otherwise null.
  pausedReason: WhatsAppPausedReason | null;
  // When Meta last accepted a send (the newest `sent` attempt); null if never.
  lastWorkedAt: Date | null;
}

export interface ResumeHeldResult {
  queued: number;
}

export interface HealthReport {
  status: "ok" | "degraded";
  database: "ok" | "down";
  inngest: "ok" | "down";
  // Informational: a token problem holds messages but never makes the app unhealthy.
  whatsappToken: WhatsAppTokenState;
}

export type WebhookPostResult =
  | { accepted: false }
  | { accepted: true; statuses: (ProviderStatusUpdate & { eventId: string })[] };

export const webhookSubscriptionInputSchema = z.object({
  mode: z.string().optional(),
  verifyToken: z.string().optional(),
  challenge: z.string().optional(),
});
export type WebhookSubscriptionInput = z.input<typeof webhookSubscriptionInputSchema>;
