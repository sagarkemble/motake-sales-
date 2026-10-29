import type { RoutePreorderRow } from "@repo/database/queries/orders";
import { z } from "zod";

import type { Balance } from "../ledger";
import { checkoutPaymentInputSchema, idempotencyKeySchema } from "../payments/model";
import type { LegalType } from "../shared/tax-engine";

export const listOrdersInputSchema = z.object({
  salesmanId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  type: z.enum(["book_now", "pre_order"]).optional(),
  status: z.enum(["confirmed", "scheduled", "due", "fulfilled", "cancelled"]).optional(),
  customerPhone: z.string().optional(),
  placedFrom: z.date().optional(),
  placedTo: z.date().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListOrdersInput = z.input<typeof listOrdersInputSchema>;

// A sale line is a Variety SKU and a pack count, nothing else. Other keys are kept here so the
// service can refuse a phone-supplied price by name instead of a generic validation error.
export const checkoutLineInputSchema = z
  .object({
    sku: z.string().trim().min(1),
    qty: z.number(),
  })
  .loose();
export type CheckoutLineInput = z.input<typeof checkoutLineInputSchema>;
export const CHECKOUT_LINE_KEYS = ["sku", "qty"] as const;

const notesSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .transform((notes) => notes || null);

export const placeBookNowInputSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(checkoutLineInputSchema),
  idempotencyKey: idempotencyKeySchema,
  notes: notesSchema,
  payment: checkoutPaymentInputSchema,
});
export type PlaceBookNowInput = z.input<typeof placeBookNowInputSchema>;

export const placePreOrderInputSchema = z.object({
  customerId: z.string().uuid(),
  // Asia/Kolkata calendar day, after today.
  scheduledDate: z.iso.date(),
  lines: z.array(checkoutLineInputSchema),
  idempotencyKey: idempotencyKeySchema,
  notes: notesSchema,
});
export type PlacePreOrderInput = z.input<typeof placePreOrderInputSchema>;

export const fulfilActorSchema = z.object({
  profileId: z.string().uuid(),
  role: z.enum(["admin", "salesman"]),
});
export type FulfilActor = z.input<typeof fulfilActorSchema>;
// Quote is open to the same two roles.
export type CheckoutActor = FulfilActor;

export const fulfilPreOrderInputSchema = z.object({
  orderId: z.string().uuid(),
  idempotencyKey: idempotencyKeySchema,
  payment: checkoutPaymentInputSchema,
});
export type FulfilPreOrderInput = z.input<typeof fulfilPreOrderInputSchema>;

// With orderId it quotes a Pre-order fulfil from its locked terms and ignores lines.
export const quoteInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  lines: z.array(checkoutLineInputSchema).default([]),
  orderType: z.enum(["book_now", "pre_order"]),
  orderId: z.string().uuid().optional(),
});
export type QuoteInput = z.input<typeof quoteInputSchema>;

export type BadLineReason = "unknown_sku" | "bad_qty" | "no_route_price" | "no_tax_period";

export interface BadLine {
  sku: string;
  reason: BadLineReason;
}

export interface ShortLine {
  sku: string;
  name: string;
  needQty: number;
  leftQty: number;
}

export interface CheckoutPaymentResult {
  // For the Receipt's WhatsApp status on the checkout result (Spec J).
  paymentId: string;
  number: string;
  keptPaise: number;
  returnedPaise: number;
}

// Book Now and fulfil.
export interface BilledCheckoutResult {
  orderId: string;
  billId: string;
  billNumber: string;
  billTotalPaise: number;
  balanceAfterBillPaise: number;
  // Null when nothing was kept.
  payment: CheckoutPaymentResult | null;
  // Cash handed back, also when nothing was kept (cash change over a Bill an Advance covers).
  returnedPaise: number;
  balancePaise: number;
}

export interface PreOrderResult {
  orderId: string;
  scheduledDate: string;
  // Display only; the Bill is taxed at fulfil from the locked terms.
  indicativeTotalPaise: number;
  // Unchanged by place.
  balancePaise: number;
}

export interface QuoteLine {
  sku: string;
  varietyId: string;
  name: string;
  unit: string;
  qty: number;
  routePricePaise: number;
  hsn: string;
  exempt: boolean;
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface QuoteTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  grossPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  totalQuantity: number;
  legalType: LegalType;
}

export interface Quote {
  // Sellable lines only; bad lines are listed apart.
  lines: QuoteLine[];
  totals: QuoteTotals;
  badLines: BadLine[];
  // Book Now only.
  shortLines: ShortLine[];
  // When a Customer is given (or the Pre-order's Customer on a fulfil quote).
  balance: Balance | null;
  // max(0, Balance + this Bill); null for a Pre-order place, which bills nothing.
  requiredToClearPaise: number | null;
}

export type PreorderDueState = "upcoming" | "due" | "overdue";

export interface RoutePreorder extends RoutePreorderRow {
  dueState: PreorderDueState;
}
