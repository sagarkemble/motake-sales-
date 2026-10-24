import { pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";

import { entityStatusEnum } from "./enums";
import { productsTable } from "./product";

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

    name: varchar("name", { length: 120 }).notNull(),

    unit: varchar("unit", { length: 32 }).notNull(),

    status: entityStatusEnum("status").notNull().default("active"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .$onUpdate(() => new Date())
      .notNull(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [uniqueIndex("product_varieties_product_name_unique").on(table.productId, table.name)],
);

export type SelectProductVariety = typeof productVarietiesTable.$inferSelect;
export type InsertProductVariety = typeof productVarietiesTable.$inferInsert;
