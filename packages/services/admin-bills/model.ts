import type { BillLetterhead, BillVersionListRow } from "@repo/database/queries/bills";
import type { SelectBill, SelectCustomer, SelectNote, SelectOrder } from "@repo/database/schema";
import { z } from "zod";

import type { Balance } from "../ledger/model";
import { idempotencyKeySchema } from "../payments/model";
import type { CorrectClassification, GstSummaryRow } from "../shared/bill-arithmetic";
import type { BillLockDecision, NoteOutcome } from "../shared/bill-events";
import type { RouteStamp } from "../shared/checkout-events";

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reasonSchema = z.string().trim().min(1).max(1000);
const versionNumberSchema = z.number().int().min(1);

const noRepeatedLine = (lines: Array<{ lineId: string }>) =>
  new Set(lines.map((line) => line.lineId)).size === lines.length;

// --- Raise Bill (office Bill: no salesman, no GatePass, no order).

// Qty is checked by the service, so a bad qty is refused as a bad line, not a validation error.
const raiseBillLineSchema = z.object({
  varietyId: z.string().uuid(),
  quantity: z.number(),
});

export const previewRaiseBillInputSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(raiseBillLineSchema),
});
export type PreviewRaiseBillInput = z.input<typeof previewRaiseBillInputSchema>;

// One key per attempt (db-decisions/0015): a retry with it returns the first Bill.
export const raiseBillInputSchema = previewRaiseBillInputSchema.extend({
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});
export type RaiseBillInput = z.input<typeof raiseBillInputSchema>;
export type ParsedRaiseBillInput = z.output<typeof raiseBillInputSchema>;

export type RaiseBillBadLineReason =
  | "unknown_variety"
  | "bad_qty"
  | "no_route_price"
  | "no_tax_period";

export interface RaiseBillBadLine {
  varietyId: string;
  reason: RaiseBillBadLineReason;
}

export interface RaiseBillCatalogRow {
  varietyId: string;
  sku: string;
  name: string;
  unit: string;
  productName: string;
  routePricePaise: number;
  hsn: string;
  exempt: boolean;
  gstRateBps: number;
}

export interface PreviewLine {
  varietyId: string;
  sku: string;
  name: string;
  unit: string;
  quantity: number;
  routePricePaise: number;
  hsn: string;
  exempt: boolean;
  gstRateBps: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
}

export interface BillTotals {
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  roundOffPaise: number;
  totalPaise: number;
  totalQuantity: number;
  legalType: SelectBill["legalType"];
}

export interface RaiseBillPreview {
  lines: PreviewLine[];
  totals: BillTotals & { grossPaise: number };
  badLines: RaiseBillBadLine[];
  balance: Balance;
}

export interface RaiseBillResult {
  billId: string;
  billNumber: string;
  billVersionId: string;
  totalPaise: number;
  balancePaise: number;
}

// --- Correct.

const buyerTextSchema = z.object({
  shopName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(20),
  address: z.string().trim().min(1),
});

export const previewCorrectInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  // New qty per live line; 0 removes it. A line left out keeps its qty.
  lines: z
    .array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().min(0) }))
    .refine(noRepeatedLine, "A line appears twice")
    .default([]),
  // The paper's buyer text; GSTIN is not editable here.
  buyer: buyerTextSchema.optional(),
});
export type PreviewCorrectInput = z.input<typeof previewCorrectInputSchema>;

export const correctBillInputSchema = previewCorrectInputSchema.extend({ reason: reasonSchema });
export type CorrectBillInput = z.input<typeof correctBillInputSchema>;

export interface NotePreview {
  kind: SelectNote["kind"];
  amountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  lines: Array<{
    lineId: string;
    quantity: number;
    amountPaise: number;
    cgstPaise: number;
    sgstPaise: number;
    igstPaise: number;
  }>;
}

export interface CorrectPreview {
  classification: CorrectClassification;
  debitNote: NotePreview | null;
  creditNote: NotePreview | null;
  totals: BillTotals;
  netDifferencePaise: number;
  lines: Array<{ lineId: string; previousQty: number; quantity: number; removed: boolean }>;
  // Never blocks: the Bill already has Notes, so the change may be counted twice.
  billHasNotes: boolean;
}

export interface CorrectResult {
  billId: string;
  billVersionId: string;
  versionNumber: number;
  classification: CorrectClassification;
  notes: NoteOutcome[];
  totalPaise: number;
  balancePaise: number;
}

// --- Cancel.

export const cancelBillInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  reason: reasonSchema,
});
export type CancelBillInput = z.input<typeof cancelBillInputSchema>;

// Spec I's portal cancellation and the orders cancel entry run the Cancel core in their own
// transaction; with no expected version they cancel the latest.
export const cancelBillCoreInputSchema = cancelBillInputSchema.extend({
  expectedVersionNumber: versionNumberSchema.optional(),
  action: z.enum(["cancel", "portal_cancel"]).default("cancel"),
});
export type CancelBillCoreInput = z.input<typeof cancelBillCoreInputSchema>;

export interface CancelBillResult {
  billId: string;
  creditNote: NoteOutcome;
  stockRestored: boolean;
  balancePaise: number;
}

export const cancelPreOrderInputSchema = z.object({
  orderId: z.string().uuid(),
  reason: reasonSchema,
});
export type CancelPreOrderInput = z.input<typeof cancelPreOrderInputSchema>;

export interface CancelPreOrderResult {
  orderId: string;
  balancePaise: number;
}

// --- Raise Note (independent of Correct; never rewrites the Bill).

export const previewRaiseNoteInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  kind: z.enum(["gst_credit_note", "commercial_credit_note", "debit_note"]),
  lines: z
    .array(z.object({ lineId: z.string().uuid(), quantity: z.number().int().positive() }))
    .refine(noRepeatedLine, "A line appears twice"),
});
export type PreviewRaiseNoteInput = z.input<typeof previewRaiseNoteInputSchema>;

export const raiseNoteInputSchema = previewRaiseNoteInputSchema.extend({
  reason: reasonSchema,
  // Credit Notes only, for a return or damage.
  returnOrDamageOn: businessDateSchema.optional(),
  // One key per attempt (db-decisions/0015): a retry with it returns the first Note.
  idempotencyKey: idempotencyKeySchema,
});
export type RaiseNoteInput = z.input<typeof raiseNoteInputSchema>;
export type ParsedRaiseNoteInput = z.output<typeof raiseNoteInputSchema>;

export interface RaiseNotePreview {
  note: NotePreview;
  billHasNotes: boolean;
}

export interface RaiseNoteResult extends NoteOutcome {
  billId: string;
  balancePaise: number;
}

// --- Bill paper and Pre-order paper reads.

export const billPaperInputSchema = z.object({
  billId: z.string().uuid(),
  // The latest when left out.
  versionNumber: versionNumberSchema.optional(),
});
export type BillPaperInput = z.input<typeof billPaperInputSchema>;

export interface PaperLine {
  id: string;
  varietyId: string;
  name: string;
  unit: string;
  hsn: string;
  // Locked, tax-exclusive.
  routePricePaise: number;
  exempt: boolean;
  gstRateBps: number;
  quantity: number;
  taxablePaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  // Taxable + tax: the stored line value.
  amountPaise: number;
  // From every Note on this line id; the Correct floor is creditedQty.
  creditedQty: number;
  remainingQty: number;
}

export interface PaperNote {
  id: string;
  kind: SelectNote["kind"];
  number: string;
  issuedOn: string;
  amountPaise: number;
  reason: string;
  returnOrDamageOn: string | null;
  hasPdf: boolean;
}

export interface BillPaper {
  bill: {
    id: string;
    number: string;
    billDate: string;
    orderId: string | null;
    // The order's place time, or the office Bill's issue time.
    placedAt: Date;
    // The order's notes; blank for an office Bill. Read-only.
    billNote: string | null;
    cancelled: boolean;
    irn: string | null;
    latestVersionNumber: number;
  };
  customer: Pick<SelectCustomer, "id" | "shopName" | "status"> | null;
  version: {
    id: string;
    versionNumber: number;
    reason: string;
    actorName: string | null;
    createdAt: Date;
    hasPdf: boolean;
    isLatest: boolean;
    legalType: SelectBill["legalType"];
    letterhead: BillLetterhead;
    totals: BillTotals;
  };
  versions: BillVersionListRow[];
  lines: PaperLine[];
  gstSummary: GstSummaryRow[];
  notes: PaperNote[];
  // Why Correct and Cancel are off on a locked month (Spec I); null on a cancelled Bill.
  lock: { correct: BillLockDecision; cancel: BillLockDecision } | null;
  actions: { canCorrect: boolean; canCancel: boolean; canRaiseNote: boolean };
  balance: Balance | null;
}

export interface PreOrderPaper {
  order: Pick<
    SelectOrder,
    "id" | "status" | "placedAt" | "notes" | "fulfilledAt" | "cancelledAt"
  > & { scheduledDate: string; dueState: "upcoming" | "due" | "overdue" };
  customer: Pick<SelectCustomer, "id" | "shopName" | "phone" | "status">;
  // The place-time Route stamp from the latest order version.
  route: RouteStamp;
  placedByName: string | null;
  lines: Array<{
    varietyId: string;
    name: string;
    unit: string;
    hsn: string;
    quantity: number;
    routePricePaise: number;
    exempt: boolean;
    gstRateBps: number;
  }>;
  // From the locked terms; null until the Seller master is set up.
  indicativeTotalPaise: number | null;
  bill: { id: string; number: string } | null;
  actions: { canCancel: boolean; canFulfil: boolean };
}
