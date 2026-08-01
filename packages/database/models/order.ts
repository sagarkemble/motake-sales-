import { pgTable, uuid, varchar, timestamp, text, integer, date } from "drizzle-orm/pg-core";

import { orderStatusEnum, orderTypeEnum } from "./enums";
import { customersTable } from "./customer";
import { profilesTable } from "./profile";
import { salesmenTable } from "./salesman";

export const ordersTable = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),

  orderCode: varchar("order_code", { length: 32 }).notNull().unique(),

  type: orderTypeEnum("type").notNull(),

  status: orderStatusEnum("status").notNull(),

  salesmanId: uuid("salesman_id")
    .notNull()
    .references(() => salesmenTable.id),

  customerId: uuid("customer_id")
    .notNull()
    .references(() => customersTable.id),

  totalQuantity: integer("total_quantity").notNull(),

  scheduledDate: date("scheduled_date"),

  placedAt: timestamp("placed_at", { withTimezone: true }).notNull(),

  fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),

  fulfilledBy: uuid("fulfilled_by").references(() => salesmenTable.id),

  idempotencyKey: varchar("idempotency_key", { length: 128 }).unique(),

  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),

  cancelledBy: uuid("cancelled_by").references(() => profilesTable.id),

  notes: text("notes"),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .$onUpdate(() => new Date())
    .notNull(),
});

export type SelectOrder = typeof ordersTable.$inferSelect;
export type InsertOrder = typeof ordersTable.$inferInsert;
