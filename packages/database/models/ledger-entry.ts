import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ledgerEntryTypeEnum, ledgerSideEnum } from "./enums";
import { customersTable } from "./customer";
import { gatepassesTable } from "./gatepass";
import { notesTable } from "./note";
import { ordersTable } from "./order";
import { paymentsTable } from "./payment";
import { profilesTable } from "./profile";
import { refundsTable } from "./refund";

// One append-only Ledger per Customer. Insert only: a trigger refuses UPDATE and DELETE.
// `customers.balance_paise` is updated in the same transaction as each insert.
export const ledgerEntriesTable = pgTable(
  "ledger_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    entryType: ledgerEntryTypeEnum("entry_type").notNull(),

    side: ledgerSideEnum("side").notNull(),

    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    // Posting time. An adjustment uses the correction date. Opening uses the cutoff date.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    orderId: uuid("order_id").references(() => ordersTable.id, { onDelete: "restrict" }),

    noteId: uuid("note_id").references(() => notesTable.id, { onDelete: "restrict" }),

    paymentId: uuid("payment_id").references(() => paymentsTable.id, { onDelete: "restrict" }),

    refundId: uuid("refund_id").references(() => refundsTable.id, { onDelete: "restrict" }),

    // Opening source, adjustment reason, office Bill reason.
    reason: text("reason"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("ledger_entries_customer_occurred_at_idx").on(table.customerId, table.occurredAt),
    uniqueIndex("ledger_entries_one_opening_per_customer")
      .on(table.customerId)
      .where(sql`${table.entryType} = 'opening_balance'`),
    uniqueIndex("ledger_entries_one_bill_per_order")
      .on(table.orderId)
      .where(sql`${table.entryType} = 'bill'`),
    uniqueIndex("ledger_entries_one_per_note")
      .on(table.noteId)
      .where(sql`${table.noteId} IS NOT NULL`),
    index("ledger_entries_payment_id_idx").on(table.paymentId),
    index("ledger_entries_refund_id_idx").on(table.refundId),
    check("ledger_entries_amount_paise_check", sql`${table.amountPaise} > 0`),
    check(
      "ledger_entries_type_links_check",
      sql`CASE ${table.entryType}
        WHEN 'opening_balance' THEN ${table.reason} IS NOT NULL
        WHEN 'bill' THEN ${table.orderId} IS NOT NULL AND ${table.side} = 'debit'
        WHEN 'credit_note' THEN ${table.noteId} IS NOT NULL AND ${table.side} = 'credit'
        WHEN 'debit_note' THEN ${table.noteId} IS NOT NULL AND ${table.side} = 'debit'
        WHEN 'payment' THEN ${table.paymentId} IS NOT NULL AND ${table.side} = 'credit'
        WHEN 'payment_adjusted' THEN ${table.paymentId} IS NOT NULL AND ${table.reason} IS NOT NULL
        WHEN 'refund' THEN ${table.refundId} IS NOT NULL AND ${table.side} = 'debit'
        WHEN 'refund_adjusted' THEN ${table.refundId} IS NOT NULL AND ${table.reason} IS NOT NULL
      END`,
    ),
  ],
);

export type SelectLedgerEntry = typeof ledgerEntriesTable.$inferSelect;
export type InsertLedgerEntry = typeof ledgerEntriesTable.$inferInsert;
