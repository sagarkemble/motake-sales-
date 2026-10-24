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
import { profilesTable } from "./profile";

// Recorded after the external payout. Only from Advance. History lives in `refund_events`.
export const refundsTable = pgTable(
  "refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    // `MR/{YY-YY}/{seq}`.
    number: varchar("number", { length: 16 }).notNull().unique(),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "restrict" }),

    mode: paymentModeEnum("mode").notNull(),

    // Current amount. May be corrected to 0; the row stays.
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),

    reference: varchar("reference", { length: 120 }),

    reason: text("reason").notNull(),

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
    index("refunds_customer_occurred_at_idx").on(table.customerId, table.occurredAt),
    check("refunds_amount_paise_check", sql`${table.amountPaise} >= 0`),
  ],
);

export type SelectRefund = typeof refundsTable.$inferSelect;
export type InsertRefund = typeof refundsTable.$inferInsert;
