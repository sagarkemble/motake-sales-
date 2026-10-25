import type { SelectLedgerEntry } from "@repo/database/schema";
import { z } from "zod";

const paiseSchema = z.number().int().positive();
const reasonSchema = z.string().trim().min(1);
// Signed: new amount minus old amount.
const differenceSchema = z
  .number()
  .int()
  .refine((difference) => difference !== 0, "A difference cannot be zero");

const postCommonSchema = z.object({
  customerId: z.string().uuid(),
  actorId: z.string().uuid(),
  // Only when a salesman posts against their Active GatePass.
  gatepassId: z.string().uuid().nullish(),
  occurredAt: z.date().optional(),
});

export const postInputSchema = z.discriminatedUnion("entryType", [
  postCommonSchema.extend({
    entryType: z.literal("bill"),
    billId: z.string().uuid(),
    reason: z.string().trim().optional(),
  }),
  postCommonSchema.extend({
    entryType: z.literal("payment"),
    paymentId: z.string().uuid(),
    reason: z.string().trim().optional(),
  }),
  postCommonSchema.extend({
    entryType: z.enum(["credit_note", "debit_note"]),
    noteId: z.string().uuid(),
  }),
  postCommonSchema.extend({
    entryType: z.literal("payment_adjusted"),
    paymentId: z.string().uuid(),
    differencePaise: differenceSchema,
    reason: reasonSchema,
  }),
  postCommonSchema.extend({
    entryType: z.literal("refund"),
    refundId: z.string().uuid(),
  }),
  postCommonSchema.extend({
    entryType: z.literal("refund_adjusted"),
    refundId: z.string().uuid(),
    differencePaise: differenceSchema,
    reason: reasonSchema,
  }),
]);
export type PostInput = z.input<typeof postInputSchema>;
export type ParsedPostInput = z.output<typeof postInputSchema>;

export const openingBalanceInputSchema = z.object({
  customerId: z.string().uuid(),
  direction: z.enum(["pending", "advance"]),
  amountPaise: paiseSchema,
  reason: reasonSchema,
  actorId: z.string().uuid(),
  occurredAt: z.date().optional(),
});
export type OpeningBalanceInput = z.input<typeof openingBalanceInputSchema>;

export const rebuildBalanceInputSchema = z.object({
  customerId: z.string().uuid(),
  actorId: z.string().uuid(),
  reason: reasonSchema,
});
export type RebuildBalanceInput = z.input<typeof rebuildBalanceInputSchema>;

export interface PostResult {
  entryId: string;
  entryType: SelectLedgerEntry["entryType"];
  side: SelectLedgerEntry["side"];
  amountPaise: number;
  balanceBeforePaise: number;
  balanceAfterPaise: number;
  occurredAt: Date;
}

export type BalanceState = "pending" | "advance" | "settled";

export interface Balance {
  balancePaise: number;
  state: BalanceState;
  amountPaise: number;
}

export interface BalanceCheck {
  storedPaise: number;
  ledgerPaise: number;
  matches: boolean;
}

export interface BalanceRebuild {
  changed: boolean;
  beforePaise: number;
  afterPaise: number;
}
