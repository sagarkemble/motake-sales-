import { z } from "../../schema";

// Exactly one paper: a Bill, a Note, a Payment or a Refund.
export const listForDocumentInputSchema = z
  .object({
    billId: z.string().uuid().optional(),
    noteId: z.string().uuid().optional(),
    paymentId: z.string().uuid().optional(),
    refundId: z.string().uuid().optional(),
  })
  .refine(
    (input) =>
      [input.billId, input.noteId, input.paymentId, input.refundId].filter((id) => id !== undefined)
        .length === 1,
    "Give exactly one of billId, noteId, paymentId or refundId",
  );

export const listForCustomerInputSchema = z.object({ customerId: z.string().uuid() });

export const resendInputSchema = z.object({ notificationId: z.string().uuid() });

export const sendLatestBillInputSchema = z.object({ billId: z.string().uuid() });

const notificationKindSchema = z.enum([
  "bill",
  "receipt",
  "credit_note",
  "debit_note",
  "account_update",
  "cancellation",
]);
const notificationStatusSchema = z.enum(["pending", "delivered", "read", "failed", "skipped"]);

export const customerMessageStatusSchema = z.object({
  notificationId: z.string(),
  kind: notificationKindSchema,
  businessRef: z.string(),
  status: notificationStatusSchema,
  skipReason: z.string().nullable(),
  attemptCount: z.number().int(),
  lastAttemptAt: z.date().nullable(),
  failureCategory: z
    .enum([
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
    ])
    .nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
  latestBill: z.boolean(),
});

export const sentMessageResultSchema = z.object({
  notificationId: z.string(),
  status: notificationStatusSchema,
});
