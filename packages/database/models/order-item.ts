import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { ordersTable } from "./order";
import { productVarietiesTable } from "./product-variety";

// Live Bill lines. Route price and covering tax period are snapshotted by the server at place.
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

    varietyName: varchar("variety_name", { length: 120 }).notNull(),

    unit: varchar("unit", { length: 32 }).notNull(),

    quantity: integer("quantity").notNull(),

    // Tax-exclusive.
    routePricePaise: bigint("route_price_paise", { mode: "number" }).notNull(),

    hsn: varchar("hsn", { length: 8 }).notNull(),

    exempt: boolean("exempt").notNull(),

    gstRateBps: integer("gst_rate_bps").notNull(),

    taxablePaise: bigint("taxable_paise", { mode: "number" }).notNull(),
    cgstPaise: bigint("cgst_paise", { mode: "number" }).notNull(),
    sgstPaise: bigint("sgst_paise", { mode: "number" }).notNull(),
    igstPaise: bigint("igst_paise", { mode: "number" }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex("order_items_order_variety_unique").on(table.orderId, table.varietyId),
    check("order_items_quantity_check", sql`${table.quantity} > 0`),
    check("order_items_route_price_paise_check", sql`${table.routePricePaise} > 0`),
    check("order_items_hsn_check", sql`${table.hsn} ~ '^[0-9]{4,8}$'`),
    check(
      "order_items_rate_check",
      sql`(${table.exempt} AND ${table.gstRateBps} = 0) OR (NOT ${table.exempt} AND ${table.gstRateBps} > 0)`,
    ),
    check(
      "order_items_money_check",
      sql`${table.taxablePaise} >= 0 AND ${table.cgstPaise} >= 0 AND ${table.sgstPaise} >= 0
        AND ${table.igstPaise} >= 0`,
    ),
  ],
);

export type SelectOrderItem = typeof orderItemsTable.$inferSelect;
export type InsertOrderItem = typeof orderItemsTable.$inferInsert;
