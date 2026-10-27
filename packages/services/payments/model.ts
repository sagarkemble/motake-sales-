import type { SelectCustomer, SelectPayment } from "@repo/database/schema";
import { z } from "zod";

import type { Balance } from "../ledger/model";

export const paymentModeSchema = z.enum(["cash", "bank", "upi"]);
export const overpayChoiceSchema = z.enum(["return_change", "keep_advance"]);

// One checkout attempt; the app keeps it across retries and makes a new one after success.
export const idempotencyKeySchema = z.string().trim().min(1).max(120);

// Empty means none.
export const referenceSchema = z
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

// --- Admin Add Payment, Payment paper and Correct (Spec H).

export const reasonSchema = z.string().trim().min(1).max(1000);

// Correct sends the reference it wants kept; empty or null clears it.
export const correctReferenceSchema = z
  .string()
  .trim()
  .max(128)
  .nullish()
  .transform((reference) => reference || null);

// An office Payment: one kept amount (received = kept, nothing returned), a required reason.
export const addPaymentInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: paymentModeSchema,
  keptPaise: z.number().int().positive(),
  reference: referenceSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type AddPaymentInput = z.input<typeof addPaymentInputSchema>;
export type ParsedAddPaymentInput = z.output<typeof addPaymentInputSchema>;

// The full state the Admin wants after Correct; ₹0 kept is allowed and is not a delete.
export const correctPaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  expectedLatestEventId: z.string().uuid(),
  keptPaise: z.number().int().min(0),
  mode: paymentModeSchema,
  reference: correctReferenceSchema,
  reason: reasonSchema,
});
export type CorrectPaymentInput = z.input<typeof correctPaymentInputSchema>;

export interface AddPaymentResult {
  paymentId: string;
  number: string;
  keptPaise: number;
  balancePaise: number;
}

export interface CorrectPaymentResult {
  paymentId: string;
  number: string;
  eventId: string;
  // Null on a mode / reference-only Correct.
  ledgerEntryId: string | null;
  keptPaise: number;
  // Kept + returned; returned change stays as recorded.
  receivedPaise: number;
  returnedPaise: number;
  // Kept after − kept before.
  differencePaise: number;
  mode: SelectPayment["mode"];
  reference: string | null;
  balancePaise: number;
}

// One row of the history list; a posted event shows no "previous".
export interface PaymentPaperEvent {
  id: string;
  kind: "posted" | "adjusted";
  occurredAt: Date;
  keptPaise: number;
  previousKeptPaise: number;
  differencePaise: number;
  mode: SelectPayment["mode"];
  reference: string | null;
  reason: string | null;
  correctionDate: string | null;
  actorName: string | null;
  ledgerEntryId: string | null;
}

// The Payment paper: header (current state), Customer with current Route, history.
export interface PaymentPaper {
  payment: {
    id: string;
    number: string;
    postedAt: Date;
    mode: SelectPayment["mode"];
    receivedPaise: number;
    keptPaise: number;
    returnedPaise: number;
    reference: string | null;
    // The Add reason from the posted event; null for a checkout or field Payment.
    reason: string | null;
    actorName: string | null;
    // A salesman's checkout or field Payment carries its GatePass; the office has none.
    source: "gatepass" | "office";
    gatepass: { id: string; businessDate: string } | null;
  };
  customer: Pick<SelectCustomer, "id" | "shopName" | "status"> & {
    routeName: string;
    routeCode: string;
  };
  events: PaymentPaperEvent[];
  // Correct's concurrency token.
  latestEventId: string;
  balance: Balance;
  actions: { canCorrect: boolean };
}
