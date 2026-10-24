import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { orderStatusEnum, orderTypeEnum } from "./enums";
import { customersTable } from "./customer";
import { gatepassesTable } from "./gatepass";
import { profilesTable } from "./profile";
import { routesTable } from "./route";
import { salesmenTable } from "./salesman";

// The sale or Pre-order. Status may change. Not the Bill — MB number, letterhead, tax totals
// and IRN live on `bills` (db-decisions/0002, 0004).
export const ordersTable = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    type: orderTypeEnum("type").notNull(),

    status: orderStatusEnum("status").notNull(),

    salesmanId: uuid("salesman_id").references(() => salesmenTable.id),

    customerId: uuid("customer_id")
      .notNull()
      .references(() => customersTable.id),

    // Book Now copies from GatePass; Pre-order owns it.
    routeId: uuid("route_id")
      .notNull()
      .references(() => routesTable.id, { onDelete: "restrict" }),

    // Book Now required (in the procedure); Pre-order empty until salesman fulfil.
    gatepassId: uuid("gatepass_id").references(() => gatepassesTable.id, { onDelete: "restrict" }),

    scheduledDate: date("scheduled_date"),

    placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),

    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),

    fulfilledBy: uuid("fulfilled_by").references(() => profilesTable.id),

    idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),

    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

    cancelledBy: uuid("cancelled_by").references(() => profilesTable.id),

    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("orders_route_id_idx").on(table.routeId),
    index("orders_gatepass_id_idx").on(table.gatepassId),
    check("orders_book_now_check", sql`${table.type} <> 'book_now' OR ${table.routeId} IS NOT NULL`),
    check("orders_pre_order_check", sql`${table.type} <> 'pre_order' OR ${table.routeId} IS NOT NULL`),
  ],
);

export type SelectOrder = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
