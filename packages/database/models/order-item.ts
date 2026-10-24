import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  jsonb,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

import { ordersTable } from "./order";
import { productVarietiesTable } from "./product-variety";

// Sale lines: what was asked. Locked Route price and tax classification at place. Billed GST
// amounts live on bill_items (db-decisions/0003, 0005).
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

    // Frozen Variety {name, unit} + tax print {hsn}.
    stamp: jsonb("stamp").notNull(),

    quantity: integer("quantity").notNull(),

    // Tax-exclusive lock at place.
    routePricePaise: bigint("route_price_paise", { mode: "number" }).notNull(),

    // Classification lock; amounts on bill_items.
    exempt: boolean("exempt").notNull(),

    // 5% is 500; lock at place.
    gstRateBps: integer("gst_rate_bps").notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_items_order_variety_unique").on(table.orderId, table.varietyId),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check("order_items_route_price_paise_check", sql`${table.routePricePaise} > 0`),
    check(
      "order_items_exempt_rate_check",
      sql`(${table.exempt} AND ${table.gstRateBps} = 0) OR (NOT ${table.exempt} AND ${table.gstRateBps} > 0)`,
    ),
  ],
);

export type SelectOrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = typeof orderItemsTable.$inferInsert;
