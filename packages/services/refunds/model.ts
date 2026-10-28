import type { SelectCustomer, SelectRefund } from "@repo/database/schema";
import { z } from "zod";

import type { Balance } from "../ledger/model";
import {
  correctReferenceSchema,
  idempotencyKeySchema,
  paymentModeSchema,
  reasonSchema,
  referenceSchema,
} from "../payments/model";

// Recorded after the external payout; only out of Advance.
export const addRefundInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: paymentModeSchema,
  amountPaise: z.number().int().positive(),
  reference: referenceSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type AddRefundInput = z.input<typeof addRefundInputSchema>;
export type ParsedAddRefundInput = z.output<typeof addRefundInputSchema>;

// The full state the Admin wants after Correct; ₹0 is allowed and is not a delete.
export const correctRefundInputSchema = z.object({
  refundId: z.string().uuid(),
  expectedLatestEventId: z.string().uuid(),
  amountPaise: z.number().int().min(0),
  mode: paymentModeSchema,
  reference: correctReferenceSchema,
  reason: reasonSchema,
});
export type CorrectRefundInput = z.input<typeof correctRefundInputSchema>;

export interface AddRefundResult {
  refundId: string;
  number: string;
  amountPaise: number;
  balancePaise: number;
}

export interface CorrectRefundResult {
  refundId: string;
  number: string;
  eventId: string;
  // Null on a mode / reference-only Correct.
  ledgerEntryId: string | null;
  amountPaise: number;
  // Amount after − amount before.
  differencePaise: number;
  mode: SelectRefund["mode"];
  reference: string | null;
  balancePaise: number;
}

// One row of the history list; a posted event shows no "previous".
export interface RefundPaperEvent {
  id: string;
  kind: "posted" | "adjusted";
  occurredAt: Date;
  amountPaise: number;
  previousAmountPaise: number;
  differencePaise: number;
  mode: SelectRefund["mode"];
  reference: string | null;
  reason: string | null;
  correctionDate: string | null;
  actorName: string | null;
  ledgerEntryId: string | null;
}

// The Refund paper: header (current state), Customer with current Route, history.
export interface RefundPaper {
  refund: {
    id: string;
    number: string;
    postedAt: Date;
    mode: SelectRefund["mode"];
    amountPaise: number;
    reference: string | null;
    // The Add reason; Corrects keep theirs on their events.
    reason: string;
    actorName: string | null;
  };
  customer: Pick<SelectCustomer, "id" | "shopName" | "status"> & {
    routeName: string;
    routeCode: string;
  };
  events: RefundPaperEvent[];
  // Correct's concurrency token.
  latestEventId: string;
  // A raise is capped at this Balance's Advance.
  balance: Balance;
  actions: { canCorrect: boolean };
}
