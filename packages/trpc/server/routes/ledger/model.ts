import { AMOUNT_TOO_LARGE, MAX_AMOUNT_PAISE, MAX_QTY, QTY_TOO_LARGE } from "@repo/services/limits";

import { z } from "../../schema";

// Admin Ledger and Bill paper (Spec G).

const businessDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const reasonSchema = z.string().trim().min(1).max(1000);
const versionNumberSchema = z.number().int().min(1);
const noRepeatedLine = (lines: Array<{ lineId: string }>) =>
  new Set(lines.map((line) => line.lineId)).size === lines.length;

export const legalTypeSchema = z.enum(["tax_invoice", "bill_of_supply"]);
export const noteKindSchema = z.enum(["gst_credit_note", "commercial_credit_note", "debit_note"]);
export const ledgerEntryTypeSchema = z.enum([
  "opening_balance",
  "bill",
  "payment",
  "credit_note",
  "debit_note",
  "payment_adjusted",
  "refund",
  "refund_adjusted",
]);
// A Note row is typed by its Note kind.
export const ledgerRowTypeSchema = z.enum([
  "opening_balance",
  "bill",
  "payment",
  "payment_adjusted",
  "refund",
  "refund_adjusted",
  "gst_credit_note",
  "commercial_credit_note",
  "debit_note",
]);
export const dueStateSchema = z.enum(["upcoming", "due", "overdue"]);
export const orderStatusSchema = z.enum([
  "confirmed",
  "scheduled",
  "due",
  "fulfilled",
  "cancelled",
]);
export const customerStatusSchema = z.enum(["active", "inactive"]);

export const balanceSchema = z.object({
  balancePaise: z.number().int(),
  state: z.enum(["pending", "advance", "settled"]),
  amountPaise: z.number().int(),
});

export const routeStampSchema = z.object({
  name: z.string(),
  code: z.string(),
  delivery_state: z.string(),
});

// Frozen at issue; Correct changes qty only, never the buyer.
export const billLetterheadSchema = z.object({
  route: routeStampSchema,
  buyer: z.object({
    shop_name: z.string(),
    phone: z.string(),
    address: z.string(),
    gstin: z.string().nullable(),
  }),
  seller: z.object({ legal_name: z.string(), address: z.string(), gstin: z.string() }),
});

export const billTotalsSchema = z.object({
  taxablePaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
  roundOffPaise: z.number().int(),
  totalPaise: z.number().int(),
  totalQuantity: z.number().int(),
  legalType: legalTypeSchema,
});

export const noteOutcomeSchema = z.object({
  noteId: z.string(),
  number: z.string(),
  kind: noteKindSchema,
  amountPaise: z.number().int(),
});

export const notePreviewSchema = z.object({
  kind: noteKindSchema,
  amountPaise: z.number().int(),
  cgstPaise: z.number().int(),
  sgstPaise: z.number().int(),
  igstPaise: z.number().int(),
  lines: z.array(
    z.object({
      lineId: z.string(),
      quantity: z.number().int(),
      amountPaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
    }),
  ),
});

export const lockDecisionSchema = z.union([
  z.object({ allowed: z.literal(true) }),
  z.object({ allowed: z.literal(false), reason: z.string(), message: z.string() }),
]);

// --- Ledger.

export const listLedgerRowsInputSchema = z.object({
  customerId: z.string().uuid(),
  types: z.array(ledgerRowTypeSchema).optional(),
  side: z.enum(["debit", "credit"]).optional(),
  from: businessDateSchema.optional(),
  to: businessDateSchema.optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(50),
});

export const ledgerOpenTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("bill"), billId: z.string() }),
  z.object({ kind: z.literal("note"), billId: z.string(), noteId: z.string() }),
  z.object({ kind: z.literal("payment"), paymentId: z.string() }),
  z.object({ kind: z.literal("refund"), refundId: z.string() }),
  z.object({ kind: z.literal("opening_balance"), entryId: z.string() }),
]);

export const ledgerRowSchema = z.object({
  id: z.string(),
  rowType: ledgerRowTypeSchema,
  entryType: ledgerEntryTypeSchema,
  date: z.string(),
  occurredAt: z.date(),
  detailsTitle: z.string(),
  typeLabel: z.string(),
  number: z.string().nullable(),
  debitPaise: z.number().int().nullable(),
  creditPaise: z.number().int().nullable(),
  cancelled: z.boolean(),
  reason: z.string().nullable(),
  open: ledgerOpenTargetSchema,
});

export const paginatedLedgerRowsSchema = z.object({
  items: z.array(ledgerRowSchema),
  totalCount: z.number(),
  page: z.number(),
  pageSize: z.number(),
  totalPages: z.number(),
});

export const customerIdInputSchema = z.object({ customerId: z.string().uuid() });

export const ledgerSummarySchema = z.object({
  customer: z.object({
    id: z.string(),
    shopName: z.string(),
    phone: z.string(),
    status: customerStatusSchema,
    routeName: z.string(),
    routeCode: z.string(),
  }),
  footer: z.object({
    opening: z.object({ debitPaise: z.number().int(), creditPaise: z.number().int() }),
    currentTotal: z.object({ debitPaise: z.number().int(), creditPaise: z.number().int() }),
    closing: balanceSchema,
  }),
  hasOpeningBalance: z.boolean(),
});

export const openPreorderSchema = z.object({
  id: z.string(),
  status: orderStatusSchema,
  scheduledDate: z.string(),
  dueState: dueStateSchema,
  placedAt: z.date(),
  route: routeStampSchema.nullable(),
  placedByName: z.string().nullable(),
  totalQuantity: z.number().int(),
  lines: z.array(
    z.object({
      varietyId: z.string(),
      name: z.string(),
      unit: z.string(),
      quantity: z.number().int(),
    }),
  ),
});

export const addOpeningBalanceInputSchema = z.object({
  customerId: z.string().uuid(),
  side: z.enum(["pending", "advance"]),
  amountPaise: z.number().int().positive().max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  reason: reasonSchema,
  openingDate: businessDateSchema.optional(),
});

export const openingBalanceResultSchema = z.object({
  entryId: z.string(),
  occurredAt: z.date(),
  balance: balanceSchema,
});

// --- Raise Bill.

const raiseBillLineSchema = z.object({ varietyId: z.string().uuid(), quantity: z.number() });

export const previewRaiseBillInputSchema = z.object({
  customerId: z.string().uuid(),
  lines: z.array(raiseBillLineSchema),
});

// One key per attempt (db-decisions/0015): a retry with it returns the first Bill or Note.
const idempotencyKeySchema = z.string().trim().min(1).max(120);

export const raiseBillInputSchema = previewRaiseBillInputSchema.extend({
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const raiseBillCatalogRowSchema = z.object({
  varietyId: z.string(),
  sku: z.string(),
  name: z.string(),
  unit: z.string(),
  productName: z.string(),
  routePricePaise: z.number().int(),
  hsn: z.string(),
  exempt: z.boolean(),
  gstRateBps: z.number().int(),
});

export const raiseBillPreviewSchema = z.object({
  lines: z.array(
    z.object({
      varietyId: z.string(),
      sku: z.string(),
      name: z.string(),
      unit: z.string(),
      quantity: z.number().int(),
      routePricePaise: z.number().int(),
      hsn: z.string(),
      exempt: z.boolean(),
      gstRateBps: z.number().int(),
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
    }),
  ),
  totals: billTotalsSchema.extend({ grossPaise: z.number().int() }),
  badLines: z.array(
    z.object({
      varietyId: z.string(),
      reason: z.enum(["unknown_variety", "bad_qty", "no_route_price", "no_tax_period"]),
    }),
  ),
  balance: balanceSchema,
});

export const raiseBillResultSchema = z.object({
  billId: z.string(),
  billNumber: z.string(),
  billVersionId: z.string(),
  totalPaise: z.number().int(),
  balancePaise: z.number().int(),
});

// --- Correct.

export const previewCorrectInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        quantity: z.number().int().min(0).max(MAX_QTY, QTY_TOO_LARGE),
      }),
    )
    .refine(noRepeatedLine, "A line appears twice")
    .default([]),
});

export const correctBillInputSchema = previewCorrectInputSchema.extend({ reason: reasonSchema });

const correctClassificationSchema = z.enum(["debit_note", "credit_note", "debit_and_credit_notes"]);

export const correctPreviewSchema = z.object({
  classification: correctClassificationSchema,
  debitNote: notePreviewSchema.nullable(),
  creditNote: notePreviewSchema.nullable(),
  totals: billTotalsSchema,
  netDifferencePaise: z.number().int(),
  lines: z.array(
    z.object({
      lineId: z.string(),
      previousQty: z.number().int(),
      quantity: z.number().int(),
      removed: z.boolean(),
    }),
  ),
  billHasNotes: z.boolean(),
});

export const correctResultSchema = z.object({
  billId: z.string(),
  billVersionId: z.string(),
  versionNumber: z.number().int(),
  classification: correctClassificationSchema,
  notes: z.array(noteOutcomeSchema),
  totalPaise: z.number().int(),
  balancePaise: z.number().int(),
});

// --- Cancel.

export const cancelBillInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  reason: reasonSchema,
});

export const cancelBillResultSchema = z.object({
  billId: z.string(),
  creditNote: noteOutcomeSchema,
  stockRestored: z.boolean(),
  balancePaise: z.number().int(),
});

export const cancelPreOrderInputSchema = z.object({
  orderId: z.string().uuid(),
  reason: reasonSchema,
});

export const cancelPreOrderResultSchema = z.object({
  orderId: z.string(),
  balancePaise: z.number().int(),
});

// --- Raise Note.

export const previewRaiseNoteInputSchema = z.object({
  billId: z.string().uuid(),
  expectedVersionNumber: versionNumberSchema,
  kind: noteKindSchema,
  lines: z
    .array(
      z.object({
        lineId: z.string().uuid(),
        quantity: z.number().int().positive().max(MAX_QTY, QTY_TOO_LARGE),
      }),
    )
    .refine(noRepeatedLine, "A line appears twice"),
});

export const raiseNoteInputSchema = previewRaiseNoteInputSchema.extend({
  reason: reasonSchema,
  returnOrDamageOn: businessDateSchema.optional(),
  idempotencyKey: idempotencyKeySchema,
});

export const raiseNotePreviewSchema = z.object({
  note: notePreviewSchema,
  billHasNotes: z.boolean(),
});

export const raiseNoteResultSchema = noteOutcomeSchema.extend({
  billId: z.string(),
  balancePaise: z.number().int(),
});

// --- Papers.

export const billPaperInputSchema = z.object({
  billId: z.string().uuid(),
});

export const billPaperSchema = z.object({
  bill: z.object({
    id: z.string(),
    number: z.string(),
    billDate: z.string(),
    orderId: z.string().nullable(),
    placedAt: z.date(),
    billNote: z.string().nullable(),
    cancelled: z.boolean(),
    irn: z.string().nullable(),
    latestVersionNumber: z.number().int(),
  }),
  customer: z
    .object({ id: z.string(), shopName: z.string(), status: customerStatusSchema })
    .nullable(),
  version: z.object({
    id: z.string(),
    versionNumber: z.number().int(),
    reason: z.string(),
    actorName: z.string().nullable(),
    createdAt: z.date(),
    hasPdf: z.boolean(),
    legalType: legalTypeSchema,
    letterhead: billLetterheadSchema,
    totals: billTotalsSchema,
  }),
  lines: z.array(
    z.object({
      id: z.string(),
      varietyId: z.string(),
      name: z.string(),
      unit: z.string(),
      hsn: z.string(),
      routePricePaise: z.number().int(),
      exempt: z.boolean(),
      gstRateBps: z.number().int(),
      quantity: z.number().int(),
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
      amountPaise: z.number().int(),
      creditedQty: z.number().int(),
      remainingQty: z.number().int(),
    }),
  ),
  gstSummary: z.array(
    z.object({
      gstRateBps: z.number().int(),
      exempt: z.boolean(),
      taxablePaise: z.number().int(),
      cgstPaise: z.number().int(),
      sgstPaise: z.number().int(),
      igstPaise: z.number().int(),
      taxPaise: z.number().int(),
    }),
  ),
  notes: z.array(
    z.object({
      id: z.string(),
      kind: noteKindSchema,
      number: z.string(),
      issuedOn: z.string(),
      amountPaise: z.number().int(),
      reason: z.string(),
      returnOrDamageOn: z.string().nullable(),
      hasPdf: z.boolean(),
    }),
  ),
  lock: z.object({ correct: lockDecisionSchema, cancel: lockDecisionSchema }).nullable(),
  actions: z.object({
    canCorrect: z.boolean(),
    canCancel: z.boolean(),
    canRaiseNote: z.boolean(),
  }),
  balance: balanceSchema.nullable(),
});

export const orderIdInputSchema = z.object({ orderId: z.string().uuid() });

export const preOrderPaperSchema = z.object({
  order: z.object({
    id: z.string(),
    status: orderStatusSchema,
    placedAt: z.date(),
    notes: z.string().nullable(),
    fulfilledAt: z.date().nullable(),
    cancelledAt: z.date().nullable(),
    scheduledDate: z.string(),
    dueState: dueStateSchema,
  }),
  customer: z.object({
    id: z.string(),
    shopName: z.string(),
    phone: z.string(),
    status: customerStatusSchema,
  }),
  route: routeStampSchema,
  placedByName: z.string().nullable(),
  lines: z.array(
    z.object({
      varietyId: z.string(),
      name: z.string(),
      unit: z.string(),
      hsn: z.string(),
      quantity: z.number().int(),
      routePricePaise: z.number().int(),
      exempt: z.boolean(),
      gstRateBps: z.number().int(),
    }),
  ),
  indicativeTotalPaise: z.number().int().nullable(),
  bill: z.object({ id: z.string(), number: z.string() }).nullable(),
  actions: z.object({ canCancel: z.boolean(), canFulfil: z.boolean() }),
});

// --- Payment, Refund and Opening papers (Spec H).

const paymentModeSchema = z.enum(["cash", "bank", "upi"]);
// Empty means none.
const referenceSchema = z.string().trim().max(128).optional();
// Correct sends the reference it wants kept; empty or null clears it.
const correctReferenceSchema = z.string().trim().max(128).nullish();
const paperCustomerSchema = z.object({
  id: z.string(),
  shopName: z.string(),
  status: customerStatusSchema,
  routeName: z.string(),
  routeCode: z.string(),
});
const eventKindSchema = z.enum(["posted", "adjusted"]);

export const paymentIdInputSchema = z.object({ paymentId: z.string().uuid() });
export const refundIdInputSchema = z.object({ refundId: z.string().uuid() });

export const addPaymentInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: paymentModeSchema,
  keptPaise: z.number().int().positive().max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  reference: referenceSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const addPaymentResultSchema = z.object({
  paymentId: z.string(),
  number: z.string(),
  keptPaise: z.number().int(),
  balancePaise: z.number().int(),
});

export const correctPaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  expectedLatestEventId: z.string().uuid(),
  keptPaise: z.number().int().min(0).max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  mode: paymentModeSchema,
  reference: correctReferenceSchema,
  reason: reasonSchema,
});

export const correctPaymentResultSchema = z.object({
  paymentId: z.string(),
  number: z.string(),
  eventId: z.string(),
  ledgerEntryId: z.string().nullable(),
  keptPaise: z.number().int(),
  receivedPaise: z.number().int(),
  returnedPaise: z.number().int(),
  differencePaise: z.number().int(),
  mode: paymentModeSchema,
  reference: z.string().nullable(),
  balancePaise: z.number().int(),
});

export const paymentPaperSchema = z.object({
  payment: z.object({
    id: z.string(),
    number: z.string(),
    postedAt: z.date(),
    mode: paymentModeSchema,
    receivedPaise: z.number().int(),
    keptPaise: z.number().int(),
    returnedPaise: z.number().int(),
    reference: z.string().nullable(),
    reason: z.string().nullable(),
    actorName: z.string().nullable(),
    source: z.enum(["gatepass", "office"]),
    gatepass: z.object({ id: z.string(), businessDate: z.string() }).nullable(),
  }),
  customer: paperCustomerSchema,
  events: z.array(
    z.object({
      id: z.string(),
      kind: eventKindSchema,
      occurredAt: z.date(),
      keptPaise: z.number().int(),
      previousKeptPaise: z.number().int(),
      differencePaise: z.number().int(),
      mode: paymentModeSchema,
      reference: z.string().nullable(),
      reason: z.string().nullable(),
      correctionDate: z.string().nullable(),
      actorName: z.string().nullable(),
      ledgerEntryId: z.string().nullable(),
    }),
  ),
  latestEventId: z.string(),
  balance: balanceSchema,
  actions: z.object({ canCorrect: z.boolean() }),
});

export const addRefundInputSchema = z.object({
  customerId: z.string().uuid(),
  mode: paymentModeSchema,
  amountPaise: z.number().int().positive().max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  reference: referenceSchema,
  reason: reasonSchema,
  idempotencyKey: idempotencyKeySchema,
});

export const addRefundResultSchema = z.object({
  refundId: z.string(),
  number: z.string(),
  amountPaise: z.number().int(),
  balancePaise: z.number().int(),
});

export const correctRefundInputSchema = z.object({
  refundId: z.string().uuid(),
  expectedLatestEventId: z.string().uuid(),
  amountPaise: z.number().int().min(0).max(MAX_AMOUNT_PAISE, AMOUNT_TOO_LARGE),
  mode: paymentModeSchema,
  reference: correctReferenceSchema,
  reason: reasonSchema,
});

export const correctRefundResultSchema = z.object({
  refundId: z.string(),
  number: z.string(),
  eventId: z.string(),
  ledgerEntryId: z.string().nullable(),
  amountPaise: z.number().int(),
  differencePaise: z.number().int(),
  mode: paymentModeSchema,
  reference: z.string().nullable(),
  balancePaise: z.number().int(),
});

export const refundPaperSchema = z.object({
  refund: z.object({
    id: z.string(),
    number: z.string(),
    postedAt: z.date(),
    mode: paymentModeSchema,
    amountPaise: z.number().int(),
    reference: z.string().nullable(),
    reason: z.string(),
    actorName: z.string().nullable(),
  }),
  customer: paperCustomerSchema,
  events: z.array(
    z.object({
      id: z.string(),
      kind: eventKindSchema,
      occurredAt: z.date(),
      amountPaise: z.number().int(),
      previousAmountPaise: z.number().int(),
      differencePaise: z.number().int(),
      mode: paymentModeSchema,
      reference: z.string().nullable(),
      reason: z.string().nullable(),
      correctionDate: z.string().nullable(),
      actorName: z.string().nullable(),
      ledgerEntryId: z.string().nullable(),
    }),
  ),
  latestEventId: z.string(),
  balance: balanceSchema,
  actions: z.object({ canCorrect: z.boolean() }),
});

export const openingPaperSchema = z
  .object({
    entryId: z.string(),
    side: z.enum(["pending", "advance"]),
    amountPaise: z.number().int(),
    date: z.string(),
    occurredAt: z.date(),
    reason: z.string().nullable(),
    actorName: z.string().nullable(),
  })
  .nullable();
