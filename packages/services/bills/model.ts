import type { SelectBill, SelectBillItem } from "@repo/database/schema";
import { z } from "zod";

import { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE, MAX_QTY, QTY_TOO_LARGE } from "../shared/limits";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const listBillsInputSchema = z.object({
  customerId: z.string().uuid().optional(),
  salesmanId: z.string().uuid().optional(),
  billDateFrom: businessDateSchema.optional(),
  billDateTo: businessDateSchema.optional(),
  numberSearch: z.string().trim().min(1).optional(),
  hideCancelled: z.boolean().optional().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(20),
});
export type ListBillsInput = z.input<typeof listBillsInputSchema>;

const lineStampSchema = z.object({
  name: z.string(),
  unit: z.string(),
  hsn: z.string(),
});

// Bill issue. Lines arrive already resolved: price and tax facts snapshotted by the caller (from
// order_items at checkout, from the Route price and covering tax period at Raise Bill).
export const issueBillInputSchema = z.object({
  actorId: z.string().uuid(),
  customerId: z.string().uuid(),
  // Null on Admin Raise Bill.
  orderId: z.string().uuid().nullable(),
  routeStamp: z.object({ name: z.string(), code: z.string(), delivery_state: z.string() }),
  lines: z
    .array(
      z.object({
        varietyId: z.string().uuid(),
        orderItemId: z.string().uuid().nullable(),
        stamp: lineStampSchema,
        quantity: z.number().int().positive().max(MAX_QTY, QTY_TOO_LARGE),
        routePricePaise: z.number().int().positive().max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
        exempt: z.boolean(),
        gstRateBps: z.number().int().min(0),
      }),
    )
    .min(1),
  gatepassId: z.string().uuid().nullable(),
  billDate: businessDateSchema,
  // Allocated by the caller before it locked the Customer.
  billNumber: z.string().min(1).max(16),
  // Goes on the Ledger Bill debit (Admin's reason at Raise Bill); bill_versions v1 is always Raised.
  reason: z.string().trim().optional(),
  // Raise Bill's client key (db-decisions/0015); none on a checkout Bill.
  idempotencyKey: z.string().max(128).optional(),
  // Ledger posting time; a checkout Payment posts 1 ms after it.
  occurredAt: z.date().optional(),
});
export type IssueBillInput = z.input<typeof issueBillInputSchema>;

export interface IssuedBill {
  bill: SelectBill;
  items: SelectBillItem[];
  billVersionId: string;
  ledgerEntryId: string;
  // After the Bill debit.
  balanceAfterPaise: number;
}
