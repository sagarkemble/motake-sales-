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

import { paymentModeEnum } from "./enums";
import { customersTable } from "./customer";
import { gatepassesTable } from "./gatepass";
import { profilesTable } from "./profile";

// Current money kept. History lives in `payment_events`. Only the kept amount is credited.
export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `MP/{YY-YY}/{seq}`. Field and Admin Payments share the series.
    number: varchar("number", { length: 16 }).notNull().unique(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    mode: paymentModeEnum("mode").notNull(),

    amountReceivedPaise: bigint("amount_received_paise", { mode: "number" }).notNull(),
    amountKeptPaise: bigint("amount_kept_paise", { mode: "number" }).notNull(),
    amountReturnedPaise: bigint("amount_returned_paise", { mode: "number" }).notNull().default(0),

    // Bank / UPI transaction id.
    reference: varchar("reference", { length: 120 }),

    // Required on Admin Add. Salesman checkout has none.
    reason: text("reason"),

    // Set when a salesman took it against an Active GatePass.
    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    actorId: uuid("actor_id")
      .notNull()
      .references(() => profilesTable.id),

    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).notNull().unique(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("payments_customer_occurred_at_idx").on(table.customerId, table.occurredAt),
    check(
      "payments_money_check",
      sql`${table.amountReceivedPaise} >= 0 AND ${table.amountKeptPaise} >= 0
        AND ${table.amountReturnedPaise} >= 0`,
    ),
    // Return-change is cash only. Bank/UPI extra is always kept as Advance.
    check(
      "payments_returned_cash_only_check",
      sql`${table.mode} = 'cash' OR ${table.amountReturnedPaise} = 0`,
    ),
  ],
);

export type SelectPayment = typeof paymentsTable.$inferSelect;
export type InsertPayment = typeof paymentsTable.$inferInsert;
