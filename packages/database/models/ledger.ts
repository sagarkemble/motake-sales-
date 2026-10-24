import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

import {
  ledgerEntryTypeEnum,
  ledgerSideEnum,
  noteKindEnum,
  paymentEventKindEnum,
  paymentModeEnum,
  refundEventKindEnum,
} from "./enums";
import { billsTable } from "./bill";
import { customersTable } from "./customer";
import { gatepassesTable } from "./gatepass";
import { profilesTable } from "./profile";
import { billVersionsTable } from "./version";

// Append-only money events for one Customer. Insert only. No tax columns.
// customers.balance_paise is a copy of Debits minus Credits and can be rebuilt from this table.
export const ledgerEntriesTable = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    entryType: ledgerEntryTypeEnum("entry_type").notNull(),

    side: ledgerSideEnum("side").notNull(),

    // Positive; side carries the sign.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    // Posting time; Payment adjustment uses the correction date.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    // Set when a salesman posted it against an Active GatePass.
    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    // Set on the Bill debit.
    billId: uuid("bill_id").references(() => billsTable.id, { onDelete: "restrict" }),

    // Set on a Credit Note or Debit Note. 1:1 with notes.ledger_entry_id (deferrable FK pair).
    noteId: uuid("note_id").references((): AnyPgColumn => notesTable.id, { onDelete: "restrict" }),

    // Set on Payment and on Payment adjusted.
    paymentId: uuid("payment_id").references((): AnyPgColumn => paymentsTable.id, {
      onDelete: "restrict",
    }),

    // Set on a Refund.
    refundId: uuid("refund_id").references((): AnyPgColumn => refundsTable.id, {
      onDelete: "restrict",
    }),

    reason: text("reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entries_customer_occurred_idx").on(table.customerId, table.occurredAt),
    uniqueIndex("ledger_entries_opening_balance_unique")
      .on(table.customerId)
      .where(sql`${table.entryType} = 'opening_balance'`),
    uniqueIndex("ledger_entries_bill_unique")
      .on(table.billId)
      .where(sql`${table.entryType} = 'bill'`),
    uniqueIndex("ledger_entries_note_unique")
      .on(table.noteId)
      .where(sql`${table.noteId} IS NOT NULL`),
    check("ledger_entries_amount_paise_check", sql`${table.amountPaise} > 0`),
  ],
);

// Credit Note or Debit Note linked to the original Bill. GST and Commercial Credit Notes share
// the Credit Note series.
export const notesTable = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    kind: noteKindEnum("kind").notNull(),

    // Never reused; cancelled keep it.
    number: varchar("number", { length: 16 }).notNull(),

    billId: uuid("bill_id")
      .notNull()
      .references(() => billsTable.id, { onDelete: "restrict" }),

    issuedOn: date("issued_on").notNull(),

    reason: text("reason").notNull(),

    // Set for a return or damage.
    returnOrDamageOn: date("return_or_damage_on"),

    // Positive customer effect.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    // Zero on a Commercial Credit Note.
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),

    sellerLegalName: varchar("seller_legal_name", { length: 200 }).notNull(),
    sellerAddress: text("seller_address").notNull(),
    sellerGstin: varchar("seller_gstin", { length: 15 }).notNull(),

    pdfUrl: text("pdf_url"),

    // The one Ledger row for this Note.
    ledgerEntryId: uuid("ledger_entry_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => ledgerEntriesTable.id, { onDelete: "restrict" }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("notes_bill_id_idx").on(table.billId),
    uniqueIndex("notes_number_unique").on(table.number),
  ],
);

// A line points at a bill_versions row plus items[].id from that version's items snapshot.
// Remaining uncredited qty is derived from prior Note lines (db-decisions/0006).
export const noteLinesTable = pgTable(
  "note_lines",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    noteId: uuid("note_id")
      .notNull()
      .references(() => notesTable.id, { onDelete: "restrict" }),

    billVersionId: uuid("bill_version_id")
      .notNull()
      .references(() => billVersionsTable.id, { onDelete: "restrict" }),

    // items[].id inside that bill_versions.items snapshot; no FK.
    snapshotLineId: uuid("snapshot_line_id").notNull(),

    quantity: integer("quantity").notNull(),

    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),
  },
  (table) => [
    index("note_lines_note_id_idx").on(table.noteId),
    index("note_lines_bill_version_line_idx").on(table.billVersionId, table.snapshotLineId),
  ],
);

// Current money kept against a Customer's Balance. Never applied to a specific Bill. Only the
// kept amount is credited. Admin may Correct kept / mode / ref (db-decisions/0011).
export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    mode: paymentModeEnum("mode").notNull(),

    amountReceivedPaise: bigint("amount_received_paise", { mode: "number" }).notNull(),
    amountKeptPaise: bigint("amount_kept_paise", { mode: "number" }).notNull(),
    amountReturnedPaise: bigint("amount_returned_paise", { mode: "number" }).notNull(),

    // `MP/{YY-YY}/{seq}`.
    number: varchar("number", { length: 16 }).notNull(),

    reference: varchar("reference", { length: 128 }),

    // Optional; empty when Admin records it.
    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payments_customer_occurred_idx").on(table.customerId, table.occurredAt),
    uniqueIndex("payments_idempotency_key_unique").on(table.idempotencyKey),
    uniqueIndex("payments_number_unique").on(table.number),
    check(
      "payments_cash_split_check",
      sql`${table.mode} <> 'cash' OR ${table.amountReceivedPaise} = ${table.amountKeptPaise} + ${table.amountReturnedPaise}`,
    ),
    check(
      "payments_kept_non_negative_check",
      sql`${table.amountKeptPaise} >= 0 AND ${table.amountReturnedPaise} >= 0`,
    ),
  ],
);

// Append-only Payment history. An adjustment updates the Payment's current kept figures, inserts
// this event, inserts the Ledger row, and updates balance_paise in one transaction.
export const paymentEventsTable = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id, { onDelete: "restrict" }),

    kind: paymentEventKindEnum("kind").notNull(),

    // Kept amount after the event.
    amountKeptPaise: bigint("amount_kept_paise", { mode: "number" }).notNull(),
    previousKeptPaise: bigint("previous_kept_paise", { mode: "number" }).notNull(),
    differencePaise: bigint("difference_paise", { mode: "number" }).notNull(),

    // Required on an adjustment.
    reason: text("reason"),

    // Mode after the event.
    mode: paymentModeEnum("mode").notNull(),

    reference: varchar("reference", { length: 128 }),

    correctionDate: date("correction_date"),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    // Null when kept did not change (mode/ref-only Correct).
    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntriesTable.id, {
      onDelete: "restrict",
    }),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("payment_events_payment_occurred_idx").on(table.paymentId, table.occurredAt)],
);

// Current payout Motake made back to a Customer out of Advance. Admin records it after the
// external Refund completes. May be Corrected to ₹0; that is not a delete.
export const refundsTable = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    // `MR/{YY-YY}/{seq}`.
    number: varchar("number", { length: 16 }).notNull(),

    mode: paymentModeEnum("mode").notNull(),

    // Current payout; >= 0.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    reference: varchar("reference", { length: 128 }),

    reason: text("reason").notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("refunds_customer_occurred_idx").on(table.customerId, table.occurredAt),
    uniqueIndex("refunds_number_unique").on(table.number),
    uniqueIndex("refunds_idempotency_key_unique").on(table.idempotencyKey),
    check("refunds_amount_paise_check", sql`${table.amountPaise} >= 0`),
  ],
);

// Append-only Refund history. Same pattern as payment_events.
export const refundEventsTable = pgTable(
  "refund_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    refundId: uuid("refund_id")
      .notNull()
      .references(() => refundsTable.id, { onDelete: "restrict" }),

    kind: refundEventKindEnum("kind").notNull(),

    // Payout after the event.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    previousAmountPaise: bigint("previous_amount_paise", { mode: "number" }).notNull(),
    differencePaise: bigint("difference_paise", { mode: "number" }).notNull(),

    mode: paymentModeEnum("mode").notNull(),

    reference: varchar("reference", { length: 128 }),

    // Required on an adjustment.
    reason: text("reason"),

    correctionDate: date("correction_date"),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntriesTable.id, {
      onDelete: "restrict",
    }),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("refund_events_refund_occurred_idx").on(table.refundId, table.occurredAt)],
);

export type SelectLedgerEntry = typeof ledgerEntriesTable.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntriesTable.$inferInsert;
export type SelectNote = typeof notesTable.$inferSelect;
export type InsertNote = typeof notesTable.$inferInsert;
export type SelectNoteLine = typeof noteLinesTable.$inferSelect;
export type InsertNoteLine = typeof noteLinesTable.$inferInsert;
export type SelectPayment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
export type SelectPaymentEvent = typeof paymentEventsTable.$inferSelect;
export type InsertPaymentEvent = typeof paymentEventsTable.$inferInsert;
export type SelectRefund = typeof refundsTable.$inferSelect;
export type InsertRefund = typeof refundsTable.$inferInsert;
export type SelectRefundEvent = typeof refundEventsTable.$inferSelect;
export type InsertRefundEvent = typeof refundEventsTable.$inferInsert;
