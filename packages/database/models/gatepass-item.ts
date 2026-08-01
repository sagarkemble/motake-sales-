import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";

import { gatepassesTable } from "./gatepass";
import { productVarietiesTable } from "./product-variety";

export const gatepassItemsTable = pgTable(
  "gatepass_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    gatepassId: uuid("gatepass_id")
      .notNull()
      .references(() => gatepassesTable.id, { onDelete: "cascade" }),

    varietyId: uuid("variety_id")
      .notNull()
      .references(() => productVarietiesTable.id),

    issuedQty: integer("issued_qty").notNull().default(0),

    soldQty: integer("sold_qty").notNull().default(0),

    returnedQty: integer("returned_qty").notNull().default(0),

    availableQty: integer("available_qty").generatedAlwaysAs(
      sql`issued_qty - sold_qty`
    ),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("gatepass_items_gatepass_variety_unique").on(
      table.gatepassId,
      table.varietyId
    ),
    check("gatepass_items_sold_qty_check", sql`${table.soldQty} >= 0`),
    check(
      "gatepass_items_sold_lte_issued_check",
      sql`${table.soldQty} <= ${table.issuedQty}`
    ),
    check("gatepass_items_returned_qty_check", sql`${table.returnedQty} >= 0`),
    check(
      "gatepass_items_returned_lte_issued_check",
      sql`${table.returnedQty} <= ${table.issuedQty}`
    ),
  ]
);

export type SelectGatepassItem = typeof gatepassItemsTable.$inferSelect;
export type InsertGatepassItem = typeof gatepassItemsTable.$inferInsert;
