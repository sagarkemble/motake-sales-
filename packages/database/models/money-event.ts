import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { moneyEventTypeEnum, paymentModeEnum } from "./enums";
import { ledgerEntriesTable } from "./ledger-entry";
import { paymentsTable } from "./payment";
import { profilesTable } from "./profile";
import { refundsTable } from "./refund";

// Append-only Payment history. Stores the state after each event. `ledger_entry_id` is empty on a
// mode/reference-only Correct and set when the kept amount changed.
export const paymentEventsTable = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    paymentId: uuid("payment_id")
      .notNull()
      .references(() => paymentsTable.id, { onDelete: "restrict" }),

    eventType: moneyEventTypeEnum("event_type").notNull(),

    keptPaise: bigint("kept_paise", { mode: "number" }).notNull(),

    mode: paymentModeEnum("mode").notNull(),

    reference: varchar("reference", { length: 120 }),

    previousKeptPaise: bigint("previous_kept_paise", { mode: "number" }),

    differencePaise: bigint("difference_paise", { mode: "number" }).notNull(),

    reason: text("reason"),

    // Correction date for an adjustment.
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntriesTable.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("payment_events_payment_occurred_at_idx").on(table.paymentId, table.occurredAt),
    check("payment_events_kept_paise_check", sql`${table.keptPaise} >= 0`),
    check(
      "payment_events_shape_check",
      sql`(${table.eventType} = 'posted' AND ${table.previousKeptPaise} IS NULL AND ${table.differencePaise} = 0)
        OR (${table.eventType} = 'adjusted' AND ${table.previousKeptPaise} IS NOT NULL AND ${table.reason} IS NOT NULL)`,
    ),
  ],
);

export const refundEventsTable = pgTable(
  "refund_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    refundId: uuid("refund_id")
      .notNull()
      .references(() => refundsTable.id, { onDelete: "restrict" }),

    eventType: moneyEventTypeEnum("event_type").notNull(),

    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    mode: paymentModeEnum("mode").notNull(),

    reference: varchar("reference", { length: 120 }),

    previousAmountPaise: bigint("previous_amount_paise", { mode: "number" }),

    differencePaise: bigint("difference_paise", { mode: "number" }).notNull(),

    reason: text("reason"),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntriesTable.id, {
      onDelete: "restrict",
    }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("refund_events_refund_occurred_at_idx").on(table.refundId, table.occurredAt),
    check("refund_events_amount_paise_check", sql`${table.amountPaise} >= 0`),
    check(
      "refund_events_shape_check",
      sql`(${table.eventType} = 'posted' AND ${table.previousAmountPaise} IS NULL AND ${table.differencePaise} = 0)
        OR (${table.eventType} = 'adjusted' AND ${table.previousAmountPaise} IS NOT NULL AND ${table.reason} IS NOT NULL)`,
    ),
  ],
);

export type SelectPaymentEvent = typeof paymentEventsTable.$inferSelect;
export type InsertPaymentEvent = typeof paymentEventsTable.$inferInsert;
export type SelectRefundEvent = typeof refundEventsTable.$inferSelect;
export type InsertRefundEvent = typeof refundEventsTable.$inferInsert;
