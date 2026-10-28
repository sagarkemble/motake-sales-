import type { CustomerPreorderRow } from "@repo/database/queries/orders";
import type { LedgerRowType } from "@repo/database/queries/ledger";
import type { SelectCustomer, SelectLedgerEntry } from "@repo/database/schema";
import { z } from "zod";

import type { Balance } from "../ledger/model";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// A Note row is typed by its Note kind, so the Admin can see only Notes, or one kind.
export const LEDGER_ROW_TYPES = [
  "opening_balance",
  "bill",
  "payment",
  "payment_adjusted",
  "refund",
  "refund_adjusted",
  "gst_credit_note",
  "commercial_credit_note",
  "debit_note",
] as const satisfies readonly LedgerRowType[];

// Filters hide rows only; the footer is always over the whole Ledger.
export const listLedgerRowsInputSchema = z.object({
  customerId: z.string().uuid(),
  types: z.array(z.enum(LEDGER_ROW_TYPES)).optional(),
  side: z.enum(["debit", "credit"]).optional(),
  // Asia/Kolkata dates, inclusive.
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});
export type ListLedgerRowsInput = z.input<typeof listLedgerRowsInputSchema>;

// Which paper a row opens.
export type LedgerOpenTarget =
  | { kind: "bill"; billId: string }
  | { kind: "note"; billId: string; noteId: string }
  | { kind: "payment"; paymentId: string }
  | { kind: "refund"; refundId: string }
  | { kind: "opening_balance"; entryId: string };

export interface LedgerRow {
  id: string;
  rowType: LedgerRowType;
  entryType: SelectLedgerEntry["entryType"];
  // Asia/Kolkata.
  date: string;
  occurredAt: Date;
  detailsTitle: string;
  typeLabel: string;
  // MB / MC / MD / MP / MR; null for an Opening balance.
  number: string | null;
  debitPaise: number | null;
  creditPaise: number | null;
  // Bill rows only.
  cancelled: boolean;
  reason: string | null;
  open: LedgerOpenTarget;
}

export interface LedgerSummary {
  customer: Pick<SelectCustomer, "id" | "shopName" | "phone" | "status"> & {
    routeName: string;
    routeCode: string;
  };
  footer: {
    // Debit = Pending brought forward, Credit = Advance brought forward.
    opening: { debitPaise: number; creditPaise: number };
    // Every Debit and every Credit except the Opening balance.
    currentTotal: { debitPaise: number; creditPaise: number };
    // Opening + Current: Pending (Debit), Advance (Credit) or Settled.
    closing: Balance;
  };
  hasOpeningBalance: boolean;
}

export type OpenPreorder = CustomerPreorderRow & { dueState: "upcoming" | "due" | "overdue" };

export const addOpeningBalanceInputSchema = z.object({
  customerId: z.string().uuid(),
  // Pending = Debit, Advance = Credit.
  side: z.enum(["pending", "advance"]),
  amountPaise: z.number().int().positive(),
  reason: z.string().trim().min(1).max(1000),
  // The cutoff date the Admin types; today when left out. Not in the future.
  openingDate: businessDateSchema.optional(),
});
export type AddOpeningBalanceInput = z.input<typeof addOpeningBalanceInputSchema>;

export interface OpeningBalanceResult {
  entryId: string;
  occurredAt: Date;
  balance: Balance;
}

// The view-only Opening paper (Spec H): no number and no Correct.
export interface OpeningPaper {
  entryId: string;
  // Debit = Pending brought forward, Credit = Advance brought forward.
  side: "pending" | "advance";
  amountPaise: number;
  // Asia/Kolkata date of the Opening row's posting time.
  date: string;
  occurredAt: Date;
  reason: string | null;
  actorName: string | null;
}
