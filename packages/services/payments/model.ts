import type { SelectPayment } from "@repo/database/schema";
import { z } from "zod";

export const paymentModeSchema = z.enum(["cash", "bank", "upi"]);
export const overpayChoiceSchema = z.enum(["return_change", "keep_advance"]);

// One checkout attempt; the app keeps it across retries and makes a new one after success.
export const idempotencyKeySchema = z.string().trim().min(1).max(120);

// Empty means none.
const referenceSchema = z
  .string()
  .trim()
  .max(128)
  .optional()
  .transform((reference) => reference || null);

// The Payment block at Book Now and fulfil. ₹0 received means the whole Bill stays Pending.
export const checkoutPaymentInputSchema = z.object({
  mode: paymentModeSchema,
  receivedPaise: z.number().int().min(0),
  reference: referenceSchema,
  overpay: overpayChoiceSchema.optional(),
});
export type CheckoutPaymentInput = z.input<typeof checkoutPaymentInputSchema>;

// Field Payment: money with no purchase. No reason field.
export const recordFieldPaymentInputSchema = checkoutPaymentInputSchema.extend({
  customerId: z.string().uuid(),
  idempotencyKey: idempotencyKeySchema,
});
export type RecordFieldPaymentInput = z.input<typeof recordFieldPaymentInputSchema>;

// The posting step. The caller has split the money, allocated the MP number and locked the
// Customer; kept ₹0 never reaches it.
export const postPaymentInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: paymentModeSchema,
  receivedPaise: z.number().int().min(0),
  keptPaise: z.number().int().positive(),
  returnedPaise: z.number().int().min(0),
  reference: z.string().max(128).nullish(),
  reason: z.string().trim().optional(),
  // Only when a salesman takes it against an Active GatePass.
  gatepassId: z.string().uuid().nullish(),
  actorId: z.string().uuid(),
  occurredAt: z.date(),
  idempotencyKey: z.string().min(1).max(128),
  number: z.string().min(1).max(16),
});
export type PostPaymentInput = z.input<typeof postPaymentInputSchema>;

export interface PostedPayment {
  payment: SelectPayment;
  postedEventId: string;
  ledgerEntryId: string;
  balanceAfterPaise: number;
}

export interface FieldPaymentResult {
  paymentId: string;
  number: string;
  keptPaise: number;
  returnedPaise: number;
  balancePaise: number;
}
