import { sql } from "drizzle-orm";
import { pgTable, uuid, integer, timestamp, uniqueIndex, check } from "drizzle-orm/pg-core";

import { ordersTable } from "./order";
import { productVarietiesTable } from "./product-variety";

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    orderId: uuid("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id),

    quantity: integer("quantity").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_items_order_variety_unique").on(table.orderId, table.varietyId),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
  ],
);

export type SelectOrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = typeof orderItemsTable.$inferInsert;
