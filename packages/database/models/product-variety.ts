import { sql, type SQL } from "drizzle-orm";
import {
  check,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";
import { productsTable } from "./product";
import { unitsOfMeasureTable } from "./unit-of-measure";

// A sellable SKU under a product. Company-wide unit_price is dropped. GST lives on
// variety_tax_periods, not here.
export const productVarietiesTable = pgTable(
  "product_varieties",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    productId: uuid("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),

    // Generated `vr-{slug}-{nnn}`; Admin does not type it.
    sku: varchar("sku", { length: 64 }).notNull().unique(),

    // Without the size; may be empty, so the Variety reads as its size alone ("500 g").
    name: varchar("name", { length: 120 }).notNull(),

    // The old pack word (pouch, cup). No longer written or shown; kept for the rows that had it.
    unit: varchar("unit", { length: 32 }),

    // 500 with uom_code ml. Both set or both null; null only on a Variety from before sizes whose
    // name had no size to split off.
    sizeValue: numeric("size_value", { precision: 10, scale: 3, mode: "string" }),
    uomCode: varchar("uom_code", { length: 12 }).references(() => unitsOfMeasureTable.code, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),

    // "Toned Milk 500 ml": what screens print and what new order and Bill lines stamp.
    displayName: varchar("display_name", { length: 160 })
      .generatedAlwaysAs(
        (): SQL =>
          sql`CASE WHEN size_value IS NULL THEN name ELSE btrim(name || ' ' || trim_scale(size_value)::text || ' ' || uom_code) END`,
      )
      .notNull(),

    status: entityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("product_varieties_product_display_name_unique").on(
      table.productId,
      table.displayName,
    ),
    check(
      "product_varieties_size_check",
      sql`(${table.sizeValue} IS NULL) = (${table.uomCode} IS NULL) AND (${table.sizeValue} IS NULL OR ${table.sizeValue} > 0)`,
    ),
  ],
);

export type SelectProductVariety = typeof productVarietiesTable.$inferSelect;
export type InsertProductVariety = typeof productVarietiesTable.$inferInsert;
